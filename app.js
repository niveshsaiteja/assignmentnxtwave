const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const format = require("date-fns/format");

const app = express();
exports.app = app;
app.use(express.json());

let db = null;

const dbPath = path.join(__dirname, "twitterClone.db");

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secretKey", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const makeServerAndDataBaseStart = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("server is runnin at port 3000");
    });
  } catch (e) {
    console.log(`error occured ${e}`);
    process.exit(1);
  }
};

makeServerAndDataBaseStart();

//api for user registration
app.post("/register/", async (request, response) => {
  let { username, password, name, gender } = request.body;
  let userExits = await db.get(
    `SELECT * FROM user WHERE username = '${username}';`
  );
  if (userExits === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      let hidePassword = await bcrypt.hash(password, 10);
      let insertQuery = `INSERT INTO user(name,username,password,gender)
            VALUES('${name}','${username}','${hidePassword}','${gender}');`;

      await db.run(insertQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(200);
    response.send("User already exists");
  }
});

//api for user login
app.post("/login/", async (request, response) => {
  let { username, password } = request.body;
  let userExists = await db.get(
    `SELECT * FROM user WHERE username = '${username}';`
  );

  if (userExists === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let passwordCheck = await bcrypt.compare(password, userExists.password);
    if (passwordCheck) {
      let jwtToken = jwt.sign({ username: userExists.username }, "secretKey");
      response.status(200);
      console.log(jwtToken);
      response.send(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//api for getting user tweets feed
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  let { user_id } = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}';`
  );
  let getQuery = `SELECT user.username as username,
  tweet.tweet as tweet,
  tweet.date_time as dateTime 
  FROM FOLLOWER INNER JOIN 
  TWEET ON FOLLOWER.following_user_id = tweet.user_id 
  inner join user 
  on user.user_id = tweet.user_id  
  WHERE follower.follower_user_id = ${user_id} limit 4;`;

  let getArray = await db.all(getQuery);
  response.status(200);
  response.send(getArray);
});

//api for getting following names of the user
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  let { user_id } = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}';`
  );
  let getQuery = `select user.name as name 
    from user inner join follower 
    on user.user_id = follower.following_user_id 
    where follower.follower_user_id = '${user_id}';`;

  let getArray = await db.all(getQuery);
  response.status(200);
  response.send(getArray);
});

//api for getting followers names of the user
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  let { user_id } = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}';`
  );
  let getQuery = `select user.name as name 
  from user inner join follower 
  on user.user_id = follower.follower_user_id 
  where follower.following_user_id = ${user_id};`;

  let getArray = await db.all(getQuery);
  response.status(200);
  response.send(getArray);
});

//api for getting the tweet stats
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { tweetId } = request.params;
  let { username } = request;
  let { user_id } = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}';`
  );
  let getQuery = `select tweet.tweet as tweet,
    count(like.like_id) as likes,
    count(reply.reply_id) as replies,
    tweet.date_time as dateTime 
    from follower inner join 
    tweet on follower.following_user_id = tweet.user_id 
    inner join reply on 
    tweet.tweet_id = reply.tweet_id 
    inner join like on 
    tweet.tweet_id = like.tweet_id where 
    follower.follower_user_id = ${user_id} 
    and tweet.tweet_id = ${tweetId};`;

  let getArray = await db.get(getQuery);
  if (getArray.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.status(200);
    response.send(getArray);
  }
});

//api for getting like for tweets
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    let { tweetId } = request.params;
    let { user_id } = await db.get(
      `SELECT user_id FROM user WHERE username = '${username}';`
    );
    let getQuery = `select user.username as likes 
    from follower inner join 
    tweet on follower.following_user_id = tweet.user_id 
    inner join like on 
    tweet.tweet_id = like.tweet_id 
    inner join user on 
    like.user_id = user.user_id 
    where follower.follower_user_id = ${user_id} 
    and tweet.tweet_id = ${tweetId};`;

    let getArray = await db.all(getQuery);

    // let likes = [];

    let normal = getArray.map((object) => {
      return object.likes;
    });
    let responseArray = {
      likes: normal,
    };
    console.log(normal);
    if (getArray.likes === null) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.status(200);
      response.send(responseArray);
    }
  }
);

//api for getting reply for tweets
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    let { tweetId } = request.params;
    let { user_id } = await db.get(
      `SELECT user_id FROM user WHERE username = '${username}';`
    );
    let getQuery = `select user.name as name, 
    reply.reply as reply 
    from follower inner join 
    tweet on follower.following_user_id = tweet.user_id 
    inner join reply on 
    tweet.tweet_id = reply.tweet_id 
    inner join user on
    reply.user_id = user.user_id 
    where follower.follower_user_id = ${user_id} 
    and tweet.tweet_id = ${tweetId};`;

    let getArray = await db.all(getQuery);

    let responseArray = {
      replies: getArray,
    };
    console.log(getArray);
    if (getArray === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.status(200);
      response.send(responseArray);
    }
  }
);

//api for getting tweets of a user
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  let { user_id } = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}';`
  );

  let getQuery = `select tweet.tweet as tweet,
    count(like.like_id) as likes,
    count(reply.reply_id)as replies,
    tweet.date_time as dateTime 
    from user inner join tweet 
    on user.user_id = tweet.user_id 
    inner join reply on 
    tweet.tweet_id = reply.tweet_id 
    inner join like on 
    tweet.tweet_id = like.tweet_id 
    where user.user_id = ${user_id} group by tweet.tweet_id;`;

  let getArray = await db.all(getQuery);
  console.log(getArray);

  response.status(200);
  response.send(getArray);
});

//api for creating a tweet
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { tweet } = request.body;
  let { username } = request;
  let { user_id } = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}';`
  );

  let date = format(new Date(), "MM/dd/yyyy hh:mm:ss");
  console.log(date);
  let insertQuery = `insert into tweet(tweet,user_id,date_time)
    values('${tweet}',${user_id},'${date}');`;

  await db.run(insertQuery);
  response.status(200);
  response.send("Created a Tweet");
});

//api for deleting a tweet
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { tweetId } = request.params;
    let { username } = request;
    let { user_id } = await db.get(
      `SELECT user_id FROM user WHERE username = '${username}';`
    );

    let deleteQuery = `delete from tweet where tweet_id = ${tweetId} and user_id = ${user_id};`;

    let getQuery = `select * from tweet where tweet_id = ${tweetId} and user_id = ${user_id};`;
    let getData = await db.get(getQuery);
    if (getData === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let responseCome = await db.run(deleteQuery);
      response.status(200);
      response.send("Tweet Removed");
    }
  }
);
