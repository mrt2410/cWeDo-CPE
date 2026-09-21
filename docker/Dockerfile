FROM eclipse-temurin:21-jdk-jammy

ARG UID=1000
ARG GID=1000

ENV ANDROID_SDK_ROOT=/opt/android-sdk \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_CMDLINE_TOOLS_VERSION=11076708 \
    ANDROID_COMPILE_SDK=36 \
    ANDROID_BUILD_TOOLS=36.0.0 \
    GRADLE_USER_HOME=/opt/gradle-home
ENV PATH=$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl unzip git ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools" \
    && curl -fsSL -o /tmp/cmdline-tools.zip \
        "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS_VERSION}_latest.zip" \
    && unzip -q /tmp/cmdline-tools.zip -d "$ANDROID_SDK_ROOT/cmdline-tools" \
    && mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest" \
    && rm /tmp/cmdline-tools.zip

RUN yes | sdkmanager --licenses >/dev/null \
    && sdkmanager --install "platform-tools" "platforms;android-${ANDROID_COMPILE_SDK}" \
        "build-tools;${ANDROID_BUILD_TOOLS}" >/dev/null

COPY docker/build-android.sh /usr/local/bin/build-android.sh
RUN chmod +x /usr/local/bin/build-android.sh

# The build writes into bind-mounted host directories (mobile/, release/) and
# into $GRADLE_USER_HOME/$ANDROID_SDK_ROOT for caches — running as root would
# leave root-owned files the host user can't clean up, so run as a user
# matching the host UID/GID instead (docker-compose passes these as build args).
RUN groupadd -g "$GID" builder \
    && useradd -m -u "$UID" -g "$GID" builder \
    && mkdir -p "$GRADLE_USER_HOME" \
    && chown -R builder:builder "$GRADLE_USER_HOME" "$ANDROID_SDK_ROOT"
USER builder

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/build-android.sh"]
