/**
 * Created by pooya on 9/27/18.
 */

const fs = require('fs');
const path = require('path');
const config = require('config');
const Request = require('request-promise');
const uuid = require('uuid/v4');
const events = require('events');
const exec = require('child_process').spawn;
const vtt2srt = require('vtt-to-srt');

const logger = require('./log/winston');
// eslint-disable-next-line
const rocketChatAuth = require('../build/rocket-chat-auth');

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

async function sendRocketSuccess(command, user, args) {
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
  if (command === 'downloading-subtitle') {
    body.msg = `در حال دانلود فایل زیرنویس "${args[0]}"`;
    delete body.emoji;
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

function startDownloadSubtitleFromYoutube(id, link, roomId) {
  const eventEmitter = new events.EventEmitter();

  const youtubeDl = exec('youtube-dl', [
    '--write-sub',
    '--proxy',
    'socks5://tor:9050',
    link,
    '-o',
    `./storage/temp/${id}/%(title)s.%(ext)s`,
  ]);

  youtubeDl.stdout.on('data', async (data) => {
    if (data.toString().match(/\[download] Destination:/)) {
      youtubeDl.kill();
    } else if (data.toString().match(/\[youtube] .+: Downloading webpage/)) {
      const fileIdMatch = /\[youtube] (.+): Downloading webpage/.exec(data.toString());
      eventEmitter.emit('data', {
        type: 'downloading-subtitle',
        file: { id: fileIdMatch[1] },
      });
    } else if (data.toString().match(/\[info] Writing video subtitles to: (.+)/)) {
      const fileMatch = /\[info] Writing video subtitles to: (.+)/.exec(data.toString());
      const fileConvert = {
        before: fileMatch[1],
        after: fileMatch[1].replace(/^(.+)\.(.+)$/, '$1.srt'),
      };
      const [, name] = path.basename(fileConvert.before).split(/^(.+)\.(.+)$/);
      const description = `زیرنویس ویدیو: ${name}`;

      try {
        await uploadFile(fileConvert.before, roomId, { description });
        eventEmitter.emit('data', { name });
      } catch (error) {
        eventEmitter.emit('error', error.message);
      }

      // fs.createReadStream(fileConvert.before)
      //   .pipe(vtt2srt())
      //   .pipe(fs.createWriteStream(fileConvert.after))
      //   .on('finish', async () => {
      //     try {
      //       await uploadFile(fileConvert.before, roomId, { description });
      //       await uploadFile(fileConvert.after, roomId, { description });
      //       eventEmitter.emit('data', { name });
      //     } catch (error) {
      //       eventEmitter.emit('error', error.message);
      //     }
      //   })
      //   .on('error', (error) => eventEmitter.emit('error', error.message));
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

module.exports = {
  uploadFile,
  sendRocketSuccess,
  sendRocketFail,
  getUserInfo,
  getRoomId,
  startDownloadSubtitleFromYoutube,
};
