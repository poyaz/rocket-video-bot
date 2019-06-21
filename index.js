/**
 * Created by pooya on 6/16/19.
 */

const config = require('config');
const express = require('express');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const crypto = require('crypto');

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
  let download = null;

  const youtubeMatch = /youtube\.com\/watch\?v=(.+)/.exec(message);
  if (youtubeMatch) {
    db[youtubeMatch[1]] = {
      type: 'youtube',
      subtitle: {
        exist: false,
      },
      message: {
        rid: null,
        'fetch-video-info': null,
        'downloading-subtitle': null,
        'downloading-video': null,
      },
    };

    await helper.createFolder(youtubeMatch[1]);
    download = helper.startDownloadSubtitleFromYoutube(youtubeMatch[1], message);
  }

  const wsjMatch = /wsj\.com\/video.+\/(.+).html$/.exec(message);
  if (wsjMatch) {
    db[wsjMatch[1]] = {
      type: 'wsj',
      subtitle: {
        exist: false,
      },
      message: {
        rid: null,
        'fetch-video-info': null,
        'downloading-subtitle': null,
        'downloading-video': null,
      },
    };

    await helper.createFolder(wsjMatch[1]);
    download = helper.startDownloadSubtitleFromWsj(wsjMatch[1], message);
  }

  const cnnMatch = /cnn\.com\/videos\/(.+)/.exec(message);
  if (cnnMatch) {
    const md5sum = crypto
      .createHash('md5')
      .update(cnnMatch[1])
      .digest('hex');

    db[cnnMatch[1]] = {
      type: 'cnn',
      subtitle: {
        exist: false,
      },
      message: {
        rid: null,
        'fetch-video-info': null,
        'downloading-subtitle': null,
        'downloading-video': null,
      },
    };

    await helper.createFolder(md5sum);
    download = helper.startDownloadSubtitleFromCnn(cnnMatch[1], message);
  }

  if (download) {
    await downloadEvent(download, sendTo);
  }

  res.setHeader('Content-Type', 'application/json');
  res.send('{"status": "success"}');
});

async function downloadEvent(download, sendTo) {
  try {
    download.on('data', (data) => new Output(sendTo._id, data));
    download.on('error', async (error) => {
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
