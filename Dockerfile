FROM          ubuntu:14.04
MAINTAINER    Jonas Finnemann Jensen <jopsen@gmail.com>

# Install node.js, a few other dependencies
RUN         DEBIAN_FRONTEND=noninteractive apt-get update -qq \
         && DEBIAN_FRONTEND=noninteractive apt-get install -qqy \
              apt-transport-https \
              ca-certificates \
              curl \
              lxc \
              iptables \
              nodejs npm nodejs-legacy \
              ;

# Use docker version 1.4.1 (I can't get dind working with docker 1.5.0)
# Anyways, the docker versions should always be locked and we should always
# check if newer versions of the remote API exposes new ways of escalating
# --privileged, capabilities, etc.
ENV         DOCKER_VERSION       1.4.1

# Install docker
RUN         echo deb https://get.docker.com/ubuntu docker main \
              > /etc/apt/sources.list.d/docker.list \
         && apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 \
              --recv-keys 36A1D7869245C8950F966E92D8576A8BA88D21E9 \
         && DEBIAN_FRONTEND=noninteractive apt-get update -qq \
         && DEBIAN_FRONTEND=noninteractive apt-get install -qqy \
              lxc-docker-$DOCKER_VERSION \
              ;

# Install the dind-service from this folder
RUN         mkdir -p /usr/local/dind-service
WORKDIR     /usr/local/dind-service
COPY        . /usr/local/dind-service
RUN         npm install --production && chmod +x ./entrypoint.sh

# Mount volume at /var/lib/docker for AUFS to work, and expose docket socket
VOLUME      /var/lib/docker
EXPOSE      2375
ENV         PORT                2375

# Pipe log out by default, set it to 'file' to use /var/log/docker.log
# Also configure proxy DEBUG-level, set it to '*' for more informational logs
ENV         LOG                 pipe
ENV         DEBUG               ''

# Warn people against building from this image, that is not the intend. You
# should use this image to setup a docker daemon you can expose.
ONBUILD     echo "If you build from this image you doing something wrong." \
            exit 1;

# Default entry-point starts docker daemon and validating proxy
ENTRYPOINT  ./entrypoint.sh
