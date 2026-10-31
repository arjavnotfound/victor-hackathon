#!/bin/sh
# One-time setup for building the Android app on a Mac, with no Android Studio
# and no sudo. Puts a JDK and the Android SDK in ~/Android (about 1.5 GB).
#   npm run android:setup
set -e
mkdir -p ~/Android && cd ~/Android
ARCH=$(uname -m | sed 's/arm64/aarch64/; s/x86_64/x64/')
if ! ls -d jdk-*/Contents/Home >/dev/null 2>&1; then
  echo "Downloading Java 21..."
  curl -sL -o jdk.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/mac/$ARCH/jdk/hotspot/normal/eclipse"
  tar xzf jdk.tar.gz && rm jdk.tar.gz
fi
if [ ! -x sdk/cmdline-tools/latest/bin/sdkmanager ]; then
  echo "Downloading Android command-line tools..."
  V=$(curl -s https://dl.google.com/android/repository/repository2-3.xml | grep -o 'commandlinetools-mac-[0-9]*_latest.zip' | sed 's/[^0-9]//g' | sort -n | tail -1)
  curl -sL -o clt.zip "https://dl.google.com/android/repository/commandlinetools-mac-${V}_latest.zip"
  mkdir -p sdk/cmdline-tools && unzip -qo clt.zip -d sdk/cmdline-tools && rm clt.zip
  rm -rf sdk/cmdline-tools/latest && mv sdk/cmdline-tools/cmdline-tools sdk/cmdline-tools/latest
fi
export JAVA_HOME="$(ls -d ~/Android/jdk-*/Contents/Home | tail -1)"
yes | sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root="$HOME/Android/sdk" --licenses >/dev/null
sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root="$HOME/Android/sdk" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
echo "Android build tools are ready. Now run: npm run apk"
