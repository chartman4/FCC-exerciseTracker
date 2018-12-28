'use strict';
require('dotenv').config();

const express = require('express')

const mongo = require('mongodb');

const mongoose = require('mongoose')

const cors = require('cors')
const moment = require('moment');

const app = express()
const bodyParser = require('body-parser')
// mongoose.connect(process.env.MLAB_URI || 'mongodb://localhost/exercise-track')
mongoose.connect(process.env.MLAB_URI);

app.use(cors())

app.use(bodyParser.urlencoded({ extended: false }))

app.use(express.static('public'))

var ExerciseSchema = new mongoose.Schema({
    description: String,
    duration: String,
    date: Date
});

var userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    exercise: [ExerciseSchema]
});

var User = mongoose.model("User", userSchema);

var _ = require('lodash');
var sortBy = require('lodash.sortby');


function sortExercises(exercises) {
    let dateStr;
    console.log("before sort!");
    // let orderedExercises = _.sortBy(exercises, function (o) { return new moment(o.date); }).reverse();
    let results = [];
    // let orderedExercises = _.sortBy(exercises, function (o) { return new moment(o.date); }).reverse();
    let orderedExercises = exercises.sort((a, b) => moment.utc(a.date, "ddd MMM DD YYYY").diff(moment.utc(b.date, "ddd MMM DD YYYY")));

    console.log("ordered: ");
    console.log(orderedExercises);
    orderedExercises.forEach(x => {
        // console.log(x.date);
        dateStr = moment(x.date, "ddd MMM DD YYYY").format("ddd MMM DD YYYY");
        results.push({ _id: x._id, description: x.description, duration: x.duration, date: dateStr })
    })
    return results;
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/views/index.html')
});

// get all users
//http://localhost:3000/api/exercise/users
app.get('/api/exercise/users', (req, res) => {
    User.find({}, '_id, name').sort('name').exec(function (err, docs) {
        res.send(docs);
    });
});

// retrieve a full exercise log of any user by getting /api/exercise/log with a parameter of userId(_id). 
//Return will be the user object with added array log and count (total exercise count).
// https://fuschia-custard.glitch.me/api/exercise/log?userId=ryzeSoVOx
// produces: {"_id":"ryzeSoVOx","username":"70767fcc","count":1,"log":[{"description":"run","duration":30,"date":"Wed Dec 05 2018"}]}
// https://fuschia-custard.glitch.me/api/exercise/log?userId=SyKsUMHNm&from=2014-01-08&to=2018-07-24&limit=5
// http://localhost:3000/api/exercise/log?userId=5c239a0edfc0ab4ff8d9e933
// http://localhost:3000/api/exercise/log?userId=5c239a0edfc0ab4ff8d9e933&from=2011-01-02&to=2018-12-26&limit=5
app.get('/api/exercise/log/', (req, res) => {
    console.log("START LOG");
    let userId = req.query.userId;
    let ckdates;
    let fromMoment;
    let toMoment;

    if ((req.query.from === undefined) || (req.query.to === undefined)) {
        ckdates = false;
    } else {
        ckdates = true;
        fromMoment = moment.utc(new Date(req.query.from));
        toMoment = moment.utc(new Date(req.query.to));
    }

    let limit = parseInt(req.query.limit);

    console.log(ckdates);
    console.log(fromMoment);
    console.log(toMoment);
    console.log(limit);

    // if invalid parameters return error message
    if (ckdates && !fromMoment.isValid())
        res.send({ status: 400, message: 'Invalid from date parameter' })
    // res.send("Invalid from date parameter");
    else if (ckdates && !toMoment.isValid())
        res.send({ status: 400, message: 'Invalid to date parameter' })
    else {

        User.findById(userId, { exercise: { $slice: limit } }, function (err, docs) {

            if (err) console.log("Error " + err);
            let user = docs;
            if (user) {
                let exercises = [];
                user.exercise.forEach(x => {
                    let dateStr = " "; //x.date.getDay();
                    let xMoment = moment.utc(x.date);
                    // console.log(xMoment);

                    // console.log((xMoment.isSameOrAfter(fromMoment, 'day')) &&
                    // (xMoment.isSameOrBefore(toMoment, 'day')));

                    if (!ckdates || ((xMoment.isSameOrAfter(fromMoment, 'day')) &&
                        (xMoment.isSameOrBefore(toMoment), 'day'))) {
                        dateStr = moment(x.date).format("ddd MMM DD YYYY");
                        exercises.push({ description: x.description, duration: x.duration, date: dateStr });
                    }

                });

                let sortedExercises = sortExercises(exercises);

                let log = { _id: user._id, username: user.name, count: exercises.length, log: sortedExercises }
                res.send(log);
            }
            else res.send("could not get log");
        });
    }
});

// add an exercise to any user by posting form data 
// userId(_id), description, duration, 
//and optionally date to /api/exercise/add. 
//If no date supplied it will use current date. 
//Returned will the the user object with also with the exercise fields added.
app.post('/api/exercise/add', (req, res) => {

    let dateObjectName;
    if (req.body.date === "") dateObjectName = Date.now();
    else {
        // var parts = dateObjectName.match(/(\d+)/g);
        // dateObjectName = new Date(parts[0], parts[1] - 1, parts[2]); // months are 0-based
        dateObjectName = moment(req.body.date);
    }

    console.log(dateObjectName);

    let dur = parseInt(req.body.duration);

    let exercise = {
        description: req.body.description,
        duration: dur,
        date: dateObjectName
    };

    User.findOneAndUpdate(
        { _id: req.body.userId },
        { $push: { exercise: exercise } },
        { safe: true, upsert: true, new: true },
        function (error, model) {
            if (error) {
                res.send(error);

            } else {
                let exercises = sortExercises(model.exercise);
                let response = { _id: model._id, name: model.name, exercises: exercises }

                res.send(response);
            }
        }
    );
});

// I can create a user by posting form data username to /api/exercise/new-user and returned will be an object with username and _id.
//localhost:3000/api/exercise/new-user?username=Rory does not work - there is a saved postman post request
app.post('/api/exercise/new-user/', (req, res) => {
    //get user name from request
    let username = req.body.username;
    let user;
    // if user not in db, create one
    User.find({ name: username }, function (err, docs) {
        if (docs.length === 0) {
            user = new User({ name: username, exercise: [] });
            user.save(function (err, user) {
                if (err) return console.error(err);
            });
            //return user
            res.send({ "username": user.name, "_id": user._id });

        } else {
            // return message
            res.send('username already taken');
        }
    });
});

// Not found middleware
app.use((req, res, next) => {
    return next({ status: 404, message: 'not found' })
})

// Error Handling middleware
app.use((err, req, res, next) => {
    let errCode, errMessage

    if (err.errors) {
        // mongoose validation error
        errCode = 400 // bad request
        const keys = Object.keys(err.errors)
        // report the first validation error
        errMessage = err.errors[keys[0]].message
    } else {
        // generic or custom error
        errCode = err.status || 500
        errMessage = err.message || 'Internal Server Error'
    }
    res.status(errCode).type('txt')
        .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
    console.log('Your app is listening on port ' + listener.address().port)
})
