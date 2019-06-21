/**
 * Created by pooya on 9/27/18.
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const config = require('config');
const Request = require('request-promise');
const uuid = require('uuid/v4');
const events = require('events');
const captions = require('node-captions');
const exec = require('child_process').spawn;

const logger = require('./log/winston');
// eslint-disable-next-line
const rocketChatAuth = require('../build/rocket-chat-auth');
const db = require('./db');

async function uploadFile(filename, roomId, { description = '' }) {
  await Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get(
      'custom.rocket.api',
    )}/rooms.upload/${roomId}`,
    headers: {
      'X-User-Id': rocketChatAuth.userId,
      'X-Auth-Token': rocketChatAuth.authToken,
      'Content-Type': `multipart/form-data; boundary=----WebKitFormBoundary${uuid()}`,
    },
    formData: {
      file: {
        // eslint-disable-next-line
        value: fs.createReadStream(filename),
        options: {
          filename,
          contentType: null,
        },
      },
      description,
    },
    json: true,
  });
}

async function sendRocketSuccess(user, data) {
  const body = {};
  if (
    Object.hasOwnProperty.call(user, 'id') &&
    Object.hasOwnProperty.call(user, 'type')
  ) {
    switch (user.type) {
      case 'channel':
        body.channel = user.id;
        break;
      case 'user':
        body.channel = user.id.substr(0, 1) !== '@' ? `@${user.id}` : user.id;
        break;
    }
  } else {
    body.channel = user;
  }
  body.emoji = ':white_check_mark:';
  if (!data.emoji.enable) {
    delete body.emoji;
  }
  body.msg = data.text;

  const result = { fail: false };
  try {
    result.output = await Request({
      method: 'post',
      url: `${config.get('custom.rocket.url')}${config.get(
        'custom.rocket.api',
      )}/chat.postMessage`,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': rocketChatAuth.userId,
        'X-Auth-Token': rocketChatAuth.authToken,
      },
      body,
      json: true,
    });
  } catch (error) {
    result.fail = true;
    logger.error(error.message.toString());
  }

  return result;
}

async function sendRocketFail(command, user, args) {
  const body = {};
  if (
    Object.hasOwnProperty.call(user, 'id') &&
    Object.hasOwnProperty.call(user, 'type')
  ) {
    switch (user.type) {
      case 'channel':
        body.channel = user.id;
        break;
      case 'user':
        body.channel = user.id.substr(0, 1) !== '@' ? `@${user.id}` : user.id;
        break;
    }
  } else {
    body.channel = user;
  }
  body.emoji = ':negative_squared_cross_mark:';
  if (command === 'error') {
    body.msg = 'خطا در اجرا کد!';
  }

  if (args && args.length) {
    body.attachments = [];
    body.attachments.push({
      color: 'red',
      fields: [],
    });

    for (let i = 0; i < args.length; i++) {
      body.attachments[0].fields.push({
        short: false,
        title: args[i].key,
        value: args[i].value,
      });
    }
  }

  try {
    await Request({
      method: 'post',
      url: `${config.get('custom.rocket.url')}${config.get(
        'custom.rocket.api',
      )}/chat.postMessage`,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': rocketChatAuth.userId,
        'X-Auth-Token': rocketChatAuth.authToken,
      },
      body,
      json: true,
    });
  } catch (error) {
    logger.error(error.message.toString());
  }
}

async function sendRocketDelete(roomId, msgId, asUser) {
  await Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get(
      'custom.rocket.api',
    )}/chat.delete`,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': rocketChatAuth.userId,
      'X-Auth-Token': rocketChatAuth.authToken,
    },
    body: {
      roomId,
      msgId,
      asUser: asUser || false,
    },
    json: true,
  });
}

async function getUserInfo(username) {
  return await Request({
    method: 'get',
    url: `${config.get('custom.rocket.url')}${config.get(
      'custom.rocket.api',
    )}/users.info?username=${username}`,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': rocketChatAuth.userId,
      'X-Auth-Token': rocketChatAuth.authToken,
    },
  });
}

async function getRoomId(name) {
  const data = await Request({
    method: 'get',
    url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/rooms.get`,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': rocketChatAuth.userId,
      'X-Auth-Token': rocketChatAuth.authToken,
    },
    json: true,
  });
  let find = null;

  for (let i = 0; i < data.update.length; i++) {
    if (data.update[i].name === name) {
      find = data.update[i];
      break;
    }
  }

  return find;
}

function startDownloadSubtitleFromYoutube(id, link) {
  const eventEmitter = new events.EventEmitter();

  const youtubeDl = exec('youtube-dl', [
    '--write-sub',
    '--write-auto-sub',
    '--proxy',
    'socks5://tor:9050',
    link,
    '-o',
    `./storage/temp/${id}/%(title)s.%(ext)s`,
  ]);

  youtubeDl.stdout.on('data', async (data) => {
    // console.log('>', data.toString());
    if (data.toString().match(/\[download] Destination:/)) {
      if (!db[id].subtitle.exist) {
        eventEmitter.emit('data', {
          type: 'no-subtitle',
          id,
        });
      }

      youtubeDl.kill();
    } else if (data.toString().match(/Downloading webpage/)) {
      eventEmitter.emit('data', {
        type: 'fetch-video-info',
        id,
      });
    } else if (data.toString().match(/\[info] Writing video subtitles to: (.+)/)) {
      db[id].subtitle.exist = true;
      eventEmitter.emit('data', {
        type: 'downloading-subtitle',
        id,
      });

      const fileMatch = /\[info] Writing video subtitles to: (.+)/.exec(data.toString());
      const [, name] = path.basename(fileMatch[1]).split(/^(.+)\.(.+)$/);
      setTimeout(
        () =>
          eventEmitter.emit('data', {
            type: 'upload-subtitle',
            id,
            path: fileMatch[1],
            name,
          }),
        1000,
      );
    }
  });

  youtubeDl.stderr.on('data', async (data) => {
    if (!data.toString().match(/WARNING/)) {
      eventEmitter.emit('error', data);
    }
  });

  // youtubeDl.on('exit', function(code) {
  //   console.log('child process exited with code ' + code);
  // });

  return eventEmitter;
}

function startDownloadSubtitleFromWsj(id, link) {
  const eventEmitter = new events.EventEmitter();

  setTimeout(() => {
    eventEmitter.emit('data', {
      type: 'fetch-video-info',
      id,
    });
  });

  const url = `https://video-api.wsj.com/api-video/find_all_videos.asp?type=guid&count=1&https=1&query=${id}&fields=name,captionsVTT`;
  const [, name] = /wsj\.com\/video\/(.+)\/.+.html$/.exec(link);
  const address = `./storage/temp/${id}/${name}.vtt`;

  /**
   * @property captionsVTT
   */
  Request({ method: 'get', url, json: true })
    .then((data) => {
      if (data.items.length === 0) {
        return eventEmitter.emit('error', new Error(`Your video ${link} not found!`));
      } else if (
        data.items.length > 0 &&
        Object.hasOwnProperty.call(data.items[0], 'error')
      ) {
        return eventEmitter.emit('error', new Error(`Your video ${link} not found!`));
      } else if (data.items.length > 0 && data.items[0].captionsVTT.length === 0) {
        return eventEmitter.emit('data', {
          type: 'no-subtitle',
          id,
        });
      }

      db[id].subtitle.exist = true;
      eventEmitter.emit('data', {
        type: 'downloading-subtitle',
        id,
      });

      Request(data.items[0].captionsVTT[0].url)
        .pipe(fs.createWriteStream(address))
        .on('finish', () => {
          setTimeout(
            () =>
              eventEmitter.emit('data', {
                type: 'upload-subtitle',
                id,
                path: address,
                name: data.items[0].name,
              }),
            1000,
          );
        });

      return true;
    })
    .catch((error) => eventEmitter.emit('error', error));

  return eventEmitter;
}

function startDownloadSubtitleFromCnn(id, link) {
  const eventEmitter = new events.EventEmitter();

  setTimeout(() => {
    eventEmitter.emit('data', {
      type: 'fetch-video-info',
      id,
    });
  });

  const md5sum = crypto
    .createHash('md5')
    .update(id)
    .digest('hex');

  const url = `https://fave.api.cnn.io/v1/video?id=${id}&customer=cnn&edition=international&env=prod`;
  const [, name] = /([^/]+)\.cnn$/.exec(link);
  const address = `./storage/temp/${md5sum}/${name}.scc`;

  /**
   * @property closedCaptions
   */
  Request({ method: 'get', url, json: true })
    .then((data) => {
      if (!Object.hasOwnProperty.call(data.closedCaptions, 'types')) {
        return eventEmitter.emit('data', {
          type: 'no-subtitle',
          id,
        });
      }

      let subtitle = '';
      for (let i = 0; i < data.closedCaptions.types.length; i++) {
        if (data.closedCaptions.types[i].format === 'scc') {
          subtitle = data.closedCaptions.types[i].track.url;
          break;
        }
      }

      if (!subtitle) {
        return eventEmitter.emit('data', {
          type: 'no-subtitle',
          id,
        });
      }

      db[id].subtitle.exist = true;
      eventEmitter.emit('data', {
        type: 'downloading-subtitle',
        id,
      });

      Request(subtitle)
        .pipe(fs.createWriteStream(address))
        .on('finish', () => {
          convertSccToVtt(address, (error, convertFile) => {
            if (error) {
              return eventEmitter.emit('error', error);
            }

            setTimeout(
              () =>
                eventEmitter.emit('data', {
                  type: 'upload-subtitle',
                  id,
                  path: convertFile,
                  name,
                }),
              1000,
            );
          });
        });

      return true;
    })
    .catch((error) => eventEmitter.emit('error', error));

  return eventEmitter;
}

async function createFolder(id) {
  try {
    await fs.accessAsync(`./storage/temp/${id}`, fs.constants.F_OK);
  } catch (error) {
    await fs.mkdirAsync(`./storage/temp/${id}`);
  }
}

function convertSccToVtt(address, callback) {
  captions.scc.read(address, {}, (error, data) => {
    if (error) {
      return callback(error);
    }

    fs.writeFile(
      address.replace(/\.scc$/, '.vtt'),
      captions.vtt.generate(captions.scc.toJSON(data)),
      (error) => {
        if (error) {
          return callback(error);
        }

        callback(null, address.replace(/\.scc$/, '.vtt'));
      },
    );
  });
}

module.exports = {
  uploadFile,
  sendRocketSuccess,
  sendRocketFail,
  sendRocketDelete,
  getUserInfo,
  getRoomId,
  startDownloadSubtitleFromYoutube,
  startDownloadSubtitleFromWsj,
  startDownloadSubtitleFromCnn,
  createFolder,
};
