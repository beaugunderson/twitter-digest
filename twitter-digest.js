'use strict';

var async = require('async');
var botUtilities = require('bot-utilities');
var BigInteger = require('jsbn');
var fs = require('fs');
var moment = require('moment');
var Twit = require('twit');
var _ = require('lodash');

var twitter = new Twit(botUtilities.getTwitterAuthFromEnv());

var EIGHT_HOURS_AGO = moment().subtract(8, 'hours');
var SIXTEEN_HOURS_AGO = EIGHT_HOURS_AGO.clone().subtract(8, 'hours');

// var THIS_MORNING = moment().hour(6).minute(0).second(0).millisecond(0);
// var YESTERDAY_MORNING = THIS_MORNING.clone().subtract(1, 'day');

// console.log(EIGHT_HOURS_AGO.format());
// console.log(SIXTEEN_HOURS_AGO.format());

var oldestMoment;
var oldestId;
var tweetCount;

var digestTweets = [];

function idComparison(a, b) {
  var aId = new BigInteger(a.id_str);
  var bId = new BigInteger(b.id_str);

  return bId.compareTo(aId);
}

function momentComparison(a, b) {
  if (a.moment.isBefore(b)) {
    return -1;
  }

  if (a.moment.isSame(b)) {
    return 0;
  }

  return 1;
}

async.whilst(function () {
  if (tweetCount === 0) {
    return false;
  }

  if (!oldestMoment || !oldestId) {
    return true;
  }

  if (oldestMoment.isBefore(SIXTEEN_HOURS_AGO)) {
    console.log('got oldest moment', oldestMoment.format());

    return false;
  }

  return true;
}, function (cbWhilst) {
  console.log('getting page...');
  console.log('oldestId', oldestId);

  twitter.get('lists/statuses', {
    list_id: 105774773,
    max_id: oldestId,
    count: 200,
    per_page: 200,
    include_rts: 1
  }, function (err, tweets) {
    if (err) {
      return cbWhilst(err);
    }

    console.log('got %d tweets', tweets.length);

    tweets = tweets.map(function (tweet) {
      tweet.moment = moment(tweet.created_at,
        'dd MMM DD HH:mm:ss ZZ YYYY', 'en');

      return tweet;
    });

    tweets.sort(idComparison);

    var originalTweets = tweets.filter(function (tweet) {
      return tweet.retweeted_status === undefined;
    });

    if (tweets.length > 2) {
      console.log('first', originalTweets[0].moment.format());
      console.log('last', originalTweets[originalTweets.length - 1].moment.format());

      oldestMoment = originalTweets[originalTweets.length - 1].moment;
      oldestId = originalTweets[originalTweets.length - 1].id_str;

      tweetCount = tweets.length;

      digestTweets = digestTweets.concat(tweets);
    } else {
      oldestMoment = null;
      oldestId = null;

      tweetCount = 0;
    }

    cbWhilst();
  });
}, function () {
  digestTweets = digestTweets.filter(function (tweet) {
    return (tweet.favorite_count > 1 ||
            tweet.retweet_count > 1) &&
           tweet.moment.isBetween(SIXTEEN_HOURS_AGO, EIGHT_HOURS_AGO);
  });

  digestTweets.sort(momentComparison);

  var ids = _.uniq(_.pluck(digestTweets, 'id_str'));

  console.log('found %d tweets', ids.length);

  fs.writeFile('./tweets.json', JSON.stringify(ids, null, 2), function () {
    console.log('wrote ./tweets.json');
  });
});
