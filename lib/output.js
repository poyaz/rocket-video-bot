/**
 * Created by woods on 6/21/19.
 */

const Promise = require('bluebird');
/**
 *
 * @property get
 */
const config = require('config');
/**
 * @property renameAsync
 */
const fs = Promise.promisifyAll(require('fs'));

const helper = require('./helper');
const db = require('./db');
const logger = require('./log/winston');

class Output {
  constructor(sendTo, data) {
    this.sendTo = sendTo;
    this.data = data;

    this._capture(data.type).catch((error) => logger.error(error.message.toString()));
  }

  async _capture(type) {
    switch (type) {
      case 'fetch-subtitle-info':
        await this._sendFetchSubtitleInfo();
        break;
      case 'downloading-subtitle':
        await this._sendDownloadingSubtitle();
        break;
      case 'upload-subtitle':
        await this._uploadSubtitle();
        break;
      case 'no-subtitle':
        await this._sendNoSubtitle();
        break;
      case 'fetch-video-info':
        await this._sendFetchVideoInfo();
        break;
      case 'downloading-video':
        await this._sendDownloadingVideo();
        break;
      case 'upload-video':
        await this._uploadVideo();
        break;
    }
  }

  async _sendFetchSubtitleInfo() {
    const body = {
      text: '',
      emoji: {
        enable: false,
      },
    };
    body.text = `در حال دریافت اطلاعات زیرنویس "${this.data.id}"`;

    const data = await helper.sendRocketSuccess(this.sendTo, body);
    if (!data.fail) {
      db[this.data.id].message.rid = data.output.message.rid;
      db[this.data.id].message['fetch-subtitle-info'] = data.output.message._id;
    }
  }

  async _sendDownloadingSubtitle() {
    await this._removeOldMessage('fetch-subtitle-info');

    const body = {
      text: '',
      emoji: {
        enable: false,
      },
    };
    body.text = `در حال دانلود فایل زیرنویس "${this.data.id}"`;

    const data = await helper.sendRocketSuccess(this.sendTo, body);
    if (!data.fail) {
      db[this.data.id].message.rid = data.output.message.rid;
      db[this.data.id].message['downloading-subtitle'] = data.output.message._id;
    }
  }

  async _uploadSubtitle() {
    const self = this;
    await this._removeOldMessage('fetch-subtitle-info');
    await this._removeOldMessage('downloading-subtitle');

    const description = `زیرنویس ویدیو: ${this.data.name}`;
    const convertFile = this.data.path.replace(/^(.+)\.(.+)$/, '$1.txt');

    async function rename() {
      try {
        await fs.renameAsync(self.data.path, convertFile);
      } catch (e) {
        await Promise.delay(500);
        await rename();
      }
    }

    await rename();
    await helper.uploadFile(convertFile, this.sendTo, { description });
  }

  async _sendNoSubtitle() {
    await this._removeOldMessage('fetch-subtitle-info');
    await this._removeOldMessage('downloading-subtitle');

    const body = {
      text: '',
      emoji: {
        enable: false,
      },
    };
    body.text = `هیچ زیرنویسی برای ویدیو "${this.data.id}" پیدا نشد`;

    await helper.sendRocketSuccess(this.sendTo, body);
  }

  async _sendFetchVideoInfo() {
    const body = {
      text: '',
      emoji: {
        enable: false,
      },
    };
    body.text = `در حال دریافت اطلاعات ویدیو "${this.data.id}"`;

    const data = await helper.sendRocketSuccess(this.sendTo, body);
    if (!data.fail) {
      db[this.data.id].message.rid = data.output.message.rid;
      db[this.data.id].message['fetch-video-info'] = data.output.message._id;
    }
  }

  async _sendDownloadingVideo() {
    await this._removeOldMessage('fetch-video-info');

    const body = {
      text: '',
      emoji: {
        enable: false,
      },
    };
    body.text = `Downloading ${db[this.data.id].part['downloading-video']} video (${this.data.id}): ${this.data.progress}`;

    if (db[this.data.id].lock['downloading-video']) {
      return;
    }

    if (!db[this.data.id].message['downloading-video']) {
      db[this.data.id].lock['downloading-video'] = true;
      const data = await helper.sendRocketSuccess(this.sendTo, body);
      if (!data.fail) {
        db[this.data.id].message.rid = data.output.message.rid;
        db[this.data.id].message['downloading-video'] = data.output.message._id;
      }
      db[this.data.id].lock['downloading-video'] = false;
    } else {
      await helper.sendRocketUpdate(
        this.sendTo,
        db[this.data.id].message['downloading-video'],
        body,
      );
    }
  }

  async _uploadVideo() {
    await this._removeOldMessage('fetch-video-info');
    await this._removeOldMessage('downloading-video');

    const host = config.get('custom.download.host');
    const port = config.get('custom.download.port');
    const protocol = config.get('custom.download.protocol');
    const convertUrl = this.data.path
      .replace(
        config.get('custom.download.replace.from'),
        config.get('custom.download.replace.to'),
      )
      .replace(/^\//, '');
    const url = `${protocol}://${host}:${port}/${convertUrl}`;

    const body = {
      text: '',
      emoji: {
        enable: false,
      },
    };
    body.text = `\n\n [لینک دانلود ویدیو ${this.data.id}](${url})`;

    await helper.sendRocketSuccess(this.sendTo, body);
  }

  async _removeOldMessage(name) {
    if (!Object.hasOwnProperty.call(db[this.data.id].message, name)) {
      return;
    }
    if (!db[this.data.id].message[name]) {
      return;
    }

    await helper.sendRocketDelete(
      db[this.data.id].message.rid,
      db[this.data.id].message[name],
    );

    db[this.data.id].message[name] = null;
  }
}

module.exports = Output;
