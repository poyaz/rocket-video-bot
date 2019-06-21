/**
 * Created by woods on 6/21/19.
 */

const Promise = require('bluebird');
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
      case 'fetch-video-info':
        await this._sendFetchVideoInfo();
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
    }
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

  async _sendDownloadingSubtitle() {
    await this._removeOldMessage('fetch-video-info');

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
    await this._removeOldMessage('fetch-video-info');
    await this._removeOldMessage('downloading-subtitle');

    const description = `زیرنویس ویدیو: ${this.data.name}`;
    const convertFile = this.data.path.replace(/^(.+)\.(.+)$/, '$1.txt');

    await fs.renameAsync(this.data.path, convertFile);

    await helper.uploadFile(convertFile, this.sendTo, { description });
  }

  async _sendNoSubtitle() {
    await this._removeOldMessage('fetch-video-info');
    await this._removeOldMessage('downloading-subtitle');

    const body = {
      text: '',
      emoji: {
        enable: false,
      },
    };
    body.text = `هیچ زیرنویسی برای ویدیو "${this.data.id}" پیدا نشد!`;

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
