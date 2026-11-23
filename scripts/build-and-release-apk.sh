#!/usr/bin/env bash
set -euo pipefail

#
# Immiguel Local APK Builder & GitHub Release Publisher
# Compiles Android APK locally using all 16 CPU cores and publishes to GitHub Releases.
#

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=========================================="
echo "🚀 Immiguel Local APK Builder"
echo "=========================================="

# 1. Determine Version
VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  # Read version from mobile/pubspec.yaml (ignoring build number)
  VERSION=$(grep '^version:' mobile/pubspec.yaml | sed -E 's/version: ([0-9]+\.[0-9]+\.[0-9]+).*/\1/')
fi

TAG="v${VERSION}"
echo "📦 Building Immiguel APK for version: $VERSION ($TAG)"

# 2. Check mise / flutter
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

if ! command -v mise >/dev/null 2>&1; then
  echo "Installing mise..."
  curl -fsSL https://mise.run | sh
fi

# Ensure rust targets
if command -v rustup >/dev/null 2>&1; then
  echo "🦀 Ensuring Rust Android targets..."
  rustup target add aarch64-linux-android armv7-linux-androideabi || true
fi

# 3. Android SDK & Java setup
if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -d "$HOME/Android/Sdk" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  elif [ -d "/opt/android-sdk" ]; then
    export ANDROID_HOME="/opt/android-sdk"
  fi
fi

if [ -n "${ANDROID_HOME:-}" ]; then
  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
fi

# 4. Install dependencies and codegen
cd "$ROOT_DIR/mobile"

echo "📥 Installing mobile dependencies..."
mise exec -- flutter pub get

echo "⚙️ Generating mobile code..."
mise exec -- dart run build_runner build --delete-conflicting-outputs || true

# 5. Build APK
echo "🔨 Compiling Android Release APK (ARM & ARM64)..."
export GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx6144m -XX:MaxMetaspaceSize=1024m"
export _JAVA_OPTIONS="-Xmx6144m"

mise exec -- flutter build apk --release --target-platform android-arm,android-arm64

APK_PATH="build/app/outputs/flutter-apk/app-release.apk"
OUT_APK="build/app/outputs/flutter-apk/immiguel.apk"

if [ -f "$APK_PATH" ]; then
  cp "$APK_PATH" "$OUT_APK"
  echo "✅ APK built successfully at: $ROOT_DIR/mobile/$OUT_APK"
  ls -lh "$OUT_APK"
else
  echo "❌ Error: APK not found at $APK_PATH"
  exit 1
fi

# 6. Publish to GitHub Releases
if [ "${2:-}" == "--no-publish" ]; then
  echo "ℹ️ Skipping publish as requested (--no-publish)."
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "⚠️ gh CLI not found. Skipping GitHub Release upload."
  exit 0
fi

echo "🚀 Publishing release $TAG to GitHub..."
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release $TAG already exists. Uploading/overwriting APK asset..."
  gh release upload "$TAG" "$OUT_APK" --clobber
else
  echo "Creating new GitHub Release $TAG..."
  gh release create "$TAG" "$OUT_APK" \
    --title "Immiguel $TAG" \
    --notes "### Immiguel Release $TAG

- **Android APK**: \`immiguel.apk\` (with native 50 MB chunked uploads)
- **Docker Image**: \`ghcr.io/sirentr0pyy/immiguel-server:latest\`
- Built locally on 16-core machine."
fi

echo "🎉 Done! Release published: https://github.com/SirEntr0pyy/immiguel/releases/tag/$TAG"
