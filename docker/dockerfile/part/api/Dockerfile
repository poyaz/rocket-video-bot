FROM docker.loc:5000/node:10.16.0-alpine

ENV EDGE_REPOSITORY=http://dl-cdn.alpinelinux.org/alpine/edge/main

RUN apk update --repository $EDGE_REPOSITORY \
	&& apk add py-pip ca-certificates \
	&& apk add ffmpeg --repository $EDGE_REPOSITORY \
	&& rm -rf /var/cache/apk/*

RUN pip install youtube-dl
