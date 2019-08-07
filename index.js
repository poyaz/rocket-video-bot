/**
 * Created by pooya on 6/16/19.
 */

const config = require('config');
const express = require('express');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const url = require('url');

const PORT = config.get('server.http.port');

const logger = require('./lib/log/winston');
const helper = require('./lib/helper');
const db = require('./lib/db');
const Output = require('./lib/output');

/**
 * @property use
 * @property get
 * @property post
 */
const app = express();
app.use(bodyParser.json());

app.post('/hook/rocket', async (req, res) => {
  // console.log(req.body);
  /**
   * @property _id
   * @property channel_id
   * @property message_id
   * @property user_name
   */
  const message = req.body.text.trim();
  const sendList = [];

  if (config.get('custom.rocket.sendTo').length) {
    sendList.push(
      ...config.get('custom.rocket.sendTo').map((v) => {
        const data = { name: null, type: null };

        if (v.substr(0, 1) === '#') {
          data.name = v.replace('#', '');
          data.type = 'channel-name';
        } else {
          data.name = v;
          data.type = 'channel-id';
        }

        return data;
      }),
    );
  } else {
    sendList.push(req.body.channel_id);
  }

  const sendTo = await helper.getRoomId(sendList[0].name);
  const videoObj = {
    id: null,
    download: null,
  };

  const supportMatch = /^!support/.exec(message);
  if (supportMatch) {
    await helper.sendRocketSuccess(sendTo._id, {
      text:
        `لیست سایت‌ها:` +
        `\n\n` +
        `> youtube.com\n` +
        `> cnn.com\n` +
        `> wsj.com\n` +
        `> barrons.com`,
      emoji: {
        enable: false,
      },
    });
  }

  const youtubeMatch = /youtube\.com\/watch\?v=(.+)/.exec(message);
  if (youtubeMatch) {
    videoObj.id = youtubeMatch[1];
    db[videoObj.id] = {
      type: 'youtube',
      hash: videoObj.id,
      subtitle: {
        exist: false,
      },
      message: {
        rid: null,
        'fetch-subtitle-info': null,
        'downloading-subtitle': null,
        'fetch-video-info': null,
        'downloading-video': null,
      },
      last: {
        'downloading-video': null,
      },
      part: {
        'downloading-video': null,
        save: null,
      },
    };

    await helper.createFolder(videoObj.id);
    videoObj.download = helper.startDownloadSubtitleFromYoutube(youtubeMatch[1], message);
  }

  const wsjMatch = /wsj\.com\/video.+\/(.+).html$/.exec(message);
  if (wsjMatch) {
    videoObj.id = wsjMatch[1];
    db[videoObj.id] = {
      type: 'wsj',
      hash: videoObj.id,
      subtitle: {
        exist: false,
      },
      message: {
        rid: null,
        'fetch-subtitle-info': null,
        'downloading-subtitle': null,
        'fetch-video-info': null,
        'downloading-video': null,
      },
      last: {
        'downloading-video': null,
      },
      part: {
        'downloading-video': null,
        save: null,
      },
    };

    await helper.createFolder(videoObj.id);
    videoObj.download = helper.startDownloadSubtitleFromWsj(wsjMatch[1], message);
  }

  const cnnMatch = /cnn\.com\/videos\/(.+)/.exec(message);
  if (cnnMatch) {
    videoObj.id = cnnMatch[1];
    videoObj.link = message;

    if (!cnnMatch[1].match(/\.cnn$/)) {
      const { protocol, host, path } = url.parse(message);
      const [, newId] = /\/videos\/(.+\.cnn)/.exec(path);
      videoObj.id = newId;
      videoObj.link = `${protocol}//${host}/${newId}`;
    }

    const md5sum = crypto
      .createHash('md5')
      .update(videoObj.id)
      .digest('hex');

    db[videoObj.id] = {
      type: 'cnn',
      hash: md5sum,
      subtitle: {
        exist: false,
      },
      message: {
        rid: null,
        'fetch-subtitle-info': null,
        'downloading-subtitle': null,
        'fetch-video-info': null,
        'downloading-video': null,
      },
      last: {
        'downloading-video': null,
      },
      part: {
        'downloading-video': null,
        save: null,
      },
    };

    await helper.createFolder(md5sum);
    videoObj.download = helper.startDownloadSubtitleFromCnn(videoObj.id, videoObj.link);
  }

  const barronMatch = /barrons\.com\/video.+\/(.+).html$/.exec(message);
  if (barronMatch) {
    videoObj.id = barronMatch[1];

    db[videoObj.id] = {
      type: 'barron',
      hash: videoObj.id,
      subtitle: {
        exist: false,
      },
      message: {
        rid: null,
        'fetch-subtitle-info': null,
        'downloading-subtitle': null,
        'fetch-video-info': null,
        'downloading-video': null,
      },
      last: {
        'downloading-video': null,
      },
      part: {
        'downloading-video': null,
        save: null,
      },
    };

    await helper.createFolder(videoObj.id);
    videoObj.download = helper.startDownloadSubtitleFromBarron(videoObj.id, message);
  }

  if (videoObj.id && videoObj.download) {
    /**
     * Event for download subtitle
     */
    await downloadEvent(videoObj.download, sendTo);

    const downloadVideo = helper.startDownloadVideo(videoObj.id, message);
    await downloadEvent(downloadVideo, sendTo);
  }

  res.setHeader('Content-Type', 'application/json');
  res.send('{"status": "success"}');
});

async function downloadEvent(download, sendTo) {
  try {
    download.on('data', (data) => new Output(sendTo._id, data));
    download.on('error', async (error, id) => {
      if (Object.hasOwnProperty.call(db, id)) {
        db[id].message = {
          'fetch-subtitle-info': null,
          'downloading-subtitle': null,
          'fetch-video-info': null,
          'downloading-video': null,
        };
      }
      await helper.sendRocketFail('error', sendTo._id, [
        {
          key: 'message',
          value: error.toString(),
        },
      ]);
    });
  } catch (error) {
    await helper.sendRocketFail('error', sendTo._id, [
      {
        key: 'message',
        value: error.message.toString(),
      },
    ]);
  }
}

Promise.resolve()
  .then(() =>
    app.listen(PORT, () => {
      logger.info(`Example app listening on port ${PORT}!`);
    }),
  )
  // Display error message if something went wrong
  .catch((error) => logger.error(error.message.toString()));
