// Description:
//   Create and manage reminders
//
// Commands:
//   hubot remind <user> in <number> <units> to <do something>
//   hubot what are your reminders - Show active reminders
//   hubot forget|rm reminder <id> - Remove a given reminder

const cronJob = require('cron').CronJob;
const moment = require('moment');

const JOBS = {};

const timeWords = {
  's': 'second',
  'second': 'second',
  'seconds': 'second',
  'm': 'minute',
  'minute': 'minute',
  'minutes': 'minute',
  'h': 'hour',
  'hour': 'hour',
  'hours': 'hour',
  'd': 'day',
  'day': 'day',
  'days': 'day'
};

const createNewJob = function(robot, pattern, user, message, origin) {
  let id;
  while ((id == null) || JOBS[id]) { id = Math.floor(Math.random() * 1000000); }
  const job = registerNewJob(robot, id, pattern, user, message, origin);
  robot.brain.data.things[id] = job.serialize();
  return id;
};

const registerNewJobFromBrain = (robot, id, pattern, user, message, origin) => registerNewJob(robot, id, pattern, user, message, origin);

var registerNewJob = function(robot, id, pattern, user, message, origin) {
  const job = new Job(id, pattern, user, message, origin);
  job.start(robot);
  return JOBS[id] = job;
};

const unregisterJob = function(robot, id){
  if (JOBS[id]) {
    JOBS[id].stop();
    delete robot.brain.data.things[id];
    delete JOBS[id];
    return true;
  }
  return false;
};

const handleNewJob = function(robot, msg, user, pattern, message) {
    const id = createNewJob(robot, pattern, user, message, msg.message);
    return msg.send(`Got it! I will remind ${user.name} at ${pattern}`);
  };

module.exports = function(robot) {
  if (!robot.brain.data.things) { robot.brain.data.things = {}; }

  // The module is loaded right now
  robot.brain.on('loaded', () => (() => {
    const result = [];
    for (var id of Object.keys(robot.brain.data.things || {})) {
      var job = robot.brain.data.things[id];
      console.log(id);
      result.push(registerNewJobFromBrain(robot, id, ...Array.from(job)));
    }
    return result;
  })());

  robot.respond(/what (will you remind|are your reminders)/i, function(msg) {
    let text = '';
    for (var id in JOBS) {
      var job = JOBS[id];
      var room = job.user.reply_to || job.user.room;
      if ((room === msg.message.user.reply_to) || (room === msg.message.user.room)) {
        text += `${id}: @${room} to \"${job.message} at ${job.pattern}\"\n`;
      }
    }
    if (text.length > 0) {
      return msg.send(text);
    } else {
      return msg.send("Nothing to remind, isn't it?");
    }
  });

  robot.respond(/(forget|rm|remove) reminder (\d+)/i, function(msg) {
    const reqId = msg.match[2];
    return (() => {
      const result = [];
      for (var id in JOBS) {
        var job = JOBS[id];
        if (reqId === id) {
          if (unregisterJob(robot, reqId)) {
            result.push(msg.send(`Reminder ${id} sleep with the fishes...`));
          } else {
            result.push(msg.send("i can't forget it, maybe i need a headshrinker"));
          }
        } else {
          result.push(undefined);
        }
      }
      return result;
    })();
  });

  return robot.respond(/remind (.*) in (\d+)([s|m|h|d]) to (.*)/i, function(msg) {
    let users;
    const name = msg.match[1];
    const at = msg.match[2];
    const time = msg.match[3];
    const something = msg.match[4];

    if (/^me$/i.test(name.trim())) {
      users = [msg.message.user];
    } else {
      users = robot.brain.usersForFuzzyName(name);
    }

    if (users.length === 1) {
      const timeWord = timeWords[time];

      return handleNewJob(robot, msg, users[0], moment().add(at, timeWord).toDate(), something);
    } else if (users.length > 1) {
      return msg.send(`Be more specific, I know ${users.length} people ` +
        `named like that: ${(Array.from(users).map((user) => user.name)).join(", ")}`
      );
    } else {
      return msg.send(`${name}? Never heard of 'em`);
    }
  });
};

class Job {
  constructor(id, pattern, user, message, origin) {
    this.id = id;
    this.pattern = pattern;
    // cloning user because adapter may touch it later
    const clonedUser = {};
    for (var k in user) { var v = user[k]; clonedUser[k] = v; }
    this.user = clonedUser;
    this.message = message;
    this.metadata = origin != null ? origin.metadata : undefined;
  }

  start(robot) {
    this.cronjob = new cronJob(this.pattern, () => {
      this.sendMessage(robot, function() {});
      return unregisterJob(robot, this.id);
    });
    return this.cronjob.start();
  }

  stop() {
    return this.cronjob.stop();
  }

  serialize() {
    return [this.pattern, this.user, this.message, this.metadata];
  }

  sendMessage(robot) {
    const envelope = {user: this.user, room: this.user.room};
    if(this.metadata != null) {
      envelope.metadata = this.metadata;
    }
    let {
      message
    } = this;
    if (this.user.mention_name) {
      message = `Hey @${envelope.user.mention_name} remember: ` + this.message;
    } else {
      message = `Hey @${envelope.user.name} remember: ` + this.message;
    }
    return robot.send(envelope, message);
  }
}
