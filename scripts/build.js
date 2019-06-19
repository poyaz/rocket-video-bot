/**
 * Created by woods on 9/28/18.
 */

/**
 * Created by woods on 9/28/18.
 */

const config = require('config');
const Promise = require('bluebird');
const Request = require('request-promise');
const uuid = require('uuid/v4');
/**
 * @property readFileAsync
 * @property writeFileAsync
 */
const fs = Promise.promisifyAll(require('fs'));

fs.readFileAsync('./build/rocket-chat-auth.json', 'utf8')
  .then((data) => {
    /**
     * @property userId
     * @property authToken
     */
    const info = JSON.parse(data);

    return sendRocketInfo(info.userId, info.authToken);
  })
  .catch((error) => {
    if (
      (error.hasOwnProperty('errno') && error.errno === -2) ||
      (error.hasOwnProperty('statusCode') && error.statusCode)
    )
      return sendRocketLogin();

    throw error;
  })
  .then((result) =>
    !result.success
      ? fs.writeFileAsync(
      './build/rocket-chat-auth.json',
      `{"userId": "${result.data.userId}", "authToken": "${result.data.authToken}"}`,
      'utf8',
      )
      : null,
  )
  .then(() =>
    // eslint-disable-next-line
    fs.readFileAsync('./build/rocket-chat-auth.json', 'utf8').then((data) => {
      /**
       * @property userId
       * @property authToken
       */
      const info = JSON.parse(data);

      return sendRocketAvatar(info.userId, info.authToken);
    }),
  )
  .then(() => process.exit())
  .catch((error) => {
    process.stderr.write(error.message.toString());
    process.stderr.write('\n');
    process.exit(1);
  });

async function sendRocketInfo(userId, authToken) {
  return await Request({
    method: 'get',
    url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/me`,
    headers: {
      'X-User-Id': userId,
      'X-Auth-Token': authToken,
    },
    json: true,
  });
}

async function sendRocketLogin() {
  return await Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/login`,
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      username: config.get('custom.rocket.bot.username'),
      password: config.get('custom.rocket.bot.password'),
    },
    json: true,
  });
}

async function sendRocketAvatar(userId, authToken) {
  const filename = './storage/private/avatar.png';

  return await Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get(
      'custom.rocket.api',
    )}/users.setAvatar`,
    headers: {
      'X-User-Id': userId,
      'X-Auth-Token': authToken,
      'Content-Type': `multipart/form-data; boundary=----WebKitFormBoundary${uuid()}`,
    },
    formData: {
      image: {
        // eslint-disable-next-line
        value: fs.createReadStream(filename),
        options: {
          filename,
          contentType: null,
        },
      },
    },
    json: true,
  });
}
