# Description:
#   Create and manage reminders
#
# Commands:
#   hubot remind <user> in <number> <units> to <do something>
#   hubot what are your reminders - Show active reminders
#   hubot forget|rm reminder <id> - Remove a given reminder

cronJob = require('cron').CronJob
moment = require('moment')

JOBS = {}

timeWords = {
  's': 'second'
  'second': 'second'
  'seconds': 'second'
  'm': 'minute'
  'minute': 'minute'
  'minutes': 'minute'
  'h': 'hour'
  'hour': 'hour'
  'hours': 'hour'
  'd': 'day'
  'day': 'day'
  'days': 'day'
}

createNewJob = (robot, pattern, user, message, origin) ->
  id = Math.floor(Math.random() * 1000000) while !id? || JOBS[id]
  job = registerNewJob robot, id, pattern, user, message, origin
  robot.brain.data.things[id] = job.serialize()
  id

registerNewJobFromBrain = (robot, id, pattern, user, message, origin) ->
  registerNewJob(robot, id, pattern, user, message, origin)

registerNewJob = (robot, id, pattern, user, message, origin) ->
  job = new Job(id, pattern, user, message, origin)
  job.start(robot)
  JOBS[id] = job

unregisterJob = (robot, id)->
  if JOBS[id]
    JOBS[id].stop()
    delete robot.brain.data.things[id]
    delete JOBS[id]
    return yes
  no

handleNewJob = (robot, msg, user, pattern, message) ->
    id = createNewJob robot, pattern, user, message, msg.message
    msg.send "Got it! I will remind #{user.name} at #{pattern}"

module.exports = (robot) ->
  robot.brain.data.things or= {}

  # The module is loaded right now
  robot.brain.on 'loaded', ->
    for own id, job of robot.brain.data.things
      console.log id
      registerNewJobFromBrain robot, id, job...

  robot.respond /what (will you remind|are your reminders)/i, (msg) ->
    text = ''
    for id, job of JOBS
      room = job.user.reply_to || job.user.room
      if room == msg.message.user.reply_to or room == msg.message.user.room
        text += "#{id}: @#{room} to \"#{job.message} at #{job.pattern}\"\n"
    if text.length > 0
      msg.send text
    else
      msg.send "Nothing to remind, isn't it?"

  robot.respond /(forget|rm|remove) reminder (\d+)/i, (msg) ->
    reqId = msg.match[2]
    for id, job of JOBS
      if (reqId == id)
        if unregisterJob(robot, reqId)
          msg.send "Reminder #{id} sleep with the fishes..."
        else
          msg.send "i can't forget it, maybe i need a headshrinker"

  robot.respond /remind (.*) in (\d+)([s|m|h|d]) to (.*)/i, (msg) ->
    name = msg.match[1]
    at = msg.match[2]
    time = msg.match[3]
    something = msg.match[4]

    if /^me$/i.test(name.trim())
      users = [msg.message.user]
    else
      users = robot.brain.usersForFuzzyName(name)

    if users.length is 1
      timeWord = timeWords[time]

      handleNewJob robot, msg, users[0], moment().add(at, timeWord).toDate(), something
    else if users.length > 1
      msg.send "Be more specific, I know #{users.length} people " +
        "named like that: #{(user.name for user in users).join(", ")}"
    else
      msg.send "#{name}? Never heard of 'em"



class Job
  constructor: (id, pattern, user, message, origin) ->
    @id = id
    @pattern = pattern
    # cloning user because adapter may touch it later
    clonedUser = {}
    clonedUser[k] = v for k,v of user
    @user = clonedUser
    @message = message
    @metadata = origin?.metadata

  start: (robot) ->
    @cronjob = new cronJob(@pattern, =>
      @sendMessage robot, ->
      unregisterJob robot, @id
    )
    @cronjob.start()

  stop: ->
    @cronjob.stop()

  serialize: ->
    [@pattern, @user, @message, @metadata]

  sendMessage: (robot) ->
    envelope = user: @user, room: @user.room
    if(@metadata?)
      envelope.metadata = @metadata
    message = @message
    if @user.mention_name
      message = "Hey @#{envelope.user.mention_name} remember: " + @message
    else
      message = "Hey @#{envelope.user.name} remember: " + @message
    robot.send envelope, message
