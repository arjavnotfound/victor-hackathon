#!/bin/sh
# Builds CRCD.apk (debug-signed, installs on any Android phone that allows
# "install unknown apps"). Needs `npm run android:setup` once.
#   npm run apk
set -e
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME:-$(ls -d ~/Android/jdk-*/Contents/Home | tail -1)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/sdk}"
npx vite build
npx cap sync android
(cd android && ./gradlew assembleDebug --quiet)
cp android/app/build/outputs/apk/debug/app-debug.apk CRCD.apk
echo "Built CRCD.apk"
