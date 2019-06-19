/**
 * Created by pooya on 6/16/19.
 */

const config = require('config');
const express = require('express');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
/**
 * @property accessAsync
 * @property mkdirAsync
 */
const fs = Promise.promisifyAll(require('fs'));

const PORT = config.get('server.http.port');

const logger = require('./lib/log/winston');
const helper = require('./lib/helper');

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

  const youtubeMatch = /youtube\.com\/watch\?v=(.+)/.exec(message);
  if (youtubeMatch) {
    const video = {
      id: youtubeMatch[1],
      str: null,
    };

    try {
      await fs.accessAsync(`./storage/temp/${video.id}`, fs.constants.F_OK);
    } catch (error) {
      await fs.mkdirAsync(`./storage/temp/${video.id}`);
    }

    try {
      const subtitle = helper.startDownloadSubtitleFromYoutube(
        video.id,
        message,
        sendTo._id,
      );
      subtitle.on('data', async (data) => {
        if (data.type === 'downloading-subtitle') {
          await helper.sendRocketSuccess(data.type, sendTo._id, [data.file.id]);
        }
      });
      subtitle.on('error', async (error) => {
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

  res.setHeader('Content-Type', 'application/json');
  res.send('{"status": "success"}');
});

Promise.resolve()
  // Launch the Node.js app
  .then(() =>
    app.listen(PORT, () => {
      logger.info(`Example app listening on port ${PORT}!`);
    }),
  )
  // Display error message if something went wrong
  .catch((error) => logger.error(error.message.toString()));
