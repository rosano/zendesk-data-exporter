const axios = require('axios').default;
const fs = require('fs');
const Bluebird = require('bluebird');
const {
  filter, map, compact, flatten, range,
} = require('lodash');

const config = {
  domain: 'caremedtravelportal.zendesk.com',
};

const baseFile = '/Users/woraphol/github/woraphol-j/zendesk-data-exporter/results';

const httpClient = axios.create({
  timeout: 12000,
  headers: {
    'Content-Type': 'application/json',
    Authorization: '',
  },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// async function listAllTickets(page) {
//   let result;
//   try {
//     result = await httpClient.get(`https://${config.domain}/api/v2/tickets.json?page=${page}`);
//   } catch (err) {
//     console.error(err.response.data);
//     throw new Error(err);
//   }
//   return result.data.tickets;
// }

async function getTicket(ticketId) {
  let result;
  try {
    result = await httpClient.get(`https://${config.domain}/api/v2/tickets/${ticketId}.json`);
  } catch (err) {
    if (err.response.status === 404) {
      return null;
    }
    console.error(err.response.data);
    throw err;
  }
  return result.data.ticket;
}

async function downloadTicket(ticketId, targetFile) {
  let result;
  try {
    result = await httpClient.get(`https://${config.domain}/api/v2/tickets/${ticketId}.json`);
  } catch (err) {
    console.error(err.response.data);
  }
  await fs.promises.writeFile(`${targetFile}`, JSON.stringify(result.data, null, 4));
}

async function downloadTicketFields() {
  let result;
  try {
    result = await httpClient.get(
      `https://${config.domain}/api/v2/ticket_fields.json`,
    );
  } catch (err) {
    console.error(err.response.data);
  }
  await fs.promises.writeFile(`${baseFile}/ticket-fields.json`, JSON.stringify(result.data, null, 4));
}

async function downloadUsers() {
  let result;
  try {
    result = await httpClient.get(
      `https://${config.domain}/api/v2/users.json`,
    );
  } catch (err) {
    console.error(err.response.data);
  }
  await fs.promises.writeFile(`${baseFile}/users.json`, JSON.stringify(result.data, null, 4));
}

async function downloadComments(ticketId, targetFolder) {
  let result;
  try {
    result = await httpClient.get(
      `https://${config.domain}/api/v2/tickets/${ticketId}/comments.json`,
    );
    if (result.data.next_page) {
      console.error('it has next page', ticketId);
    }
  } catch (err) {
    console.error(err.response.data);
  }

  await fs.promises.writeFile(`${targetFolder}/comments.json`, JSON.stringify(result.data, null, 4));

  const attachments = flatten(filter(compact(map(result.data.comments, 'attachments')), (attachment) => attachment.length !== 0));
  await Bluebird.map(attachments, async (attachment) => {
    result = await httpClient.get(
      attachment.content_url,
      {
        responseType: 'stream',
      },
    );
    const aWriter = fs.createWriteStream(`${targetFolder}/${attachment.id}_${attachment.file_name}`);
    result.data.pipe(aWriter);
  });
}

async function process() {
  // const allTickets = await listAllTickets(page);
  // const tickets = map(allTickets, ({ id, subject }) => ({
  //   id,
  //   subject,
  // }));
  // console.info('List all ticket ids = ', tickets);
  // Use range because https://support.zendesk.com/hc/en-us/articles/203657756#comment_204752187
  const ticketIds = range(1, 679, 1);
  // const ticketIds = range(1, 398, 1);
  // const ticketIds = [525];
  await downloadUsers();
  await downloadTicketFields();

  await Bluebird.map(
    ticketIds,
    async (ticketId) => {
      try {
        const ticket = await getTicket(ticketId);
        if (ticket === null) {
          console.info(
            'Skipped ticket does not exist',
            ticketId,
          );
          return;
        }
        const ticketFolder = `${baseFile}/[${ticket.id}]__${ticket.subject || ticket.description}`;
        await fs.promises.mkdir(ticketFolder, {
          recursive: true,
        });
        await downloadTicket(
          ticket.id,
          `${ticketFolder}/ticket.json`,
        );
        await downloadComments(
          ticket.id,
          `${ticketFolder}`,
        );
        console.info('Processed ticket = ', ticket.id);
        await sleep(4000);
      } catch (err) {
        console.error(`Error ticket = ${ticketId}`, err.message);
      }
    },
    {
      concurrency: 5,
    },
  );
}

process(3).then(() => {
  console.info('Successfully');
}, (err) => {
  console.error(`Error: ${err}`);
});
