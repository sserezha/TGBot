const ok = "ok";
const { localsName } = require('ejs');
const { constants } = require('fs/promises');
const telegramApi = require('node-telegram-bot-api');
const Calendar = require('telegram-inline-calendar');
const { Collection } = require('mongodb');
const dotenv=require("dotenv").config();
const token = process.env.TOKEN;
const bot = new telegramApi(token, {polling: true});
const MongoClient = require('mongodb').MongoClient;
const url = process.env.URL;
const mongoClient = new MongoClient(url);
const calendar = new Calendar(bot, {
    date_format: 'YYYY-MM-DD',
    language: 'ru'
});

async function endReg(UID, ridesCount){
	await mongoClient.connect();
	const db= mongoClient.db("main");
	const collectionTemp = db.collection("temporaryRegistry");
	const collectionRegistry = db.collection("registry");
	const collectionUsers = db.collection("users");
	const user = await collectionUsers.find({id:UID}).toArray();
	console.log(user);
	const tempRegFull = await collectionTemp.find({UID:UID}).toArray();
	const tempReg = tempRegFull[0];
	let convertedRideType = 1;
	if (tempReg.enteredData.rideType == "Погрузка") {
		convertedRideType = 2;
	} else {
		convertedRideType = 1;
	}
	const toWrite = {enteredData:
		{
			date:tempReg.enteredData.date,
			autoNo:user[0].autoNo,
			woodSpecies:tempReg.enteredData.loadins,
			sortiment:tempReg.enteredData.sortiments,
			rideType:convertedRideType,
			rideFrom:tempReg.enteredData.loadouts,
			rideTo:tempReg.enteredData.destinations,
			ridesCount:ridesCount
		}
		}
		await collectionRegistry.insertOne(toWrite);
		await collectionTemp.deleteOne({UID:UID});
}
async function updateState(newState, id){
	const newUser = {
		state: newState
	};
	await writeToDB(newUser,'users',id);
}
async function closeDBConnection(){
	try {
		await mongoClient.close();
	}catch(err){
		console.log(err);
	}
}
async function checkUserState(UID){
	let isExist = false;
	await mongoClient.connect();
	const db = mongoClient.db("main");
	const collection = db.collection('users');
	const findResult = await collection.find({}).toArray();
	if (findResult.length != 0) {
		findResult.forEach(element => {
			if (element.id === UID){
				isExist = element._id;
			}
		});
	}
	return isExist;
}
async function getUserState(UID){
	let result = false;
	await mongoClient.connect();
	const db = mongoClient.db("main");
	const collection = db.collection('users');
	const findResult = await collection.find({}).toArray();
	if (findResult.length != 0) {
		findResult.forEach(element => {
			if (element.id === UID){
				result = element.state;
			}
		});
	}
	return result;
}


async function writeToDB(dataToWrite, dbname, id = null) {
    try {
        await mongoClient.connect();
        const db = mongoClient.db("main");
        const collection = db.collection(dbname);
        
        if (id) {
            const filter = { _id: id };
            const updateResult = await collection.updateOne(filter, { $set: dataToWrite });
            if (updateResult.modifiedCount === 0) {
                await collection.insertOne(dataToWrite);
            }
        } else {
            await collection.insertOne(dataToWrite);
        }
    } catch(err) {
        console.log(err);
    }
}

async function getUsersFromDB(UID){
try {
	await mongoClient.connect();
	const db = mongoClient.db("main");
	const collection = db.collection('users');
	const findResult = await collection.find({}).toArray();
	const result = [];
	findResult.forEach((item) => {
		if (item.id === UID){
			result.push(item);
		}
	});
	return result;
	}catch(err) {
	console.log(err);
}
}

async function updateTempRegistry(param, UID){
	try{
		await mongoClient.connect();
		const db = mongoClient.db("main");
		const collectionOpt = db.collection("options");
		const collectionTemp = db.collection("temporaryRegistry");
		const collectionReplies = db.collection("replies");
		const lookupOption = await collectionTemp.find({UID:UID}).toArray();
		const option = await collectionReplies.find({state:lookupOption[0].tempRegState}).toArray();
		const optionTextToWrite = await collectionOpt.find({"optionName":option[0].nextButtons}).toArray();
		const nextState = await collectionReplies.find({nextButtons:option[0].nextButtons}).toArray();
		await collectionTemp.updateOne({"UID":UID},{$set: { [`enteredData.${option[0].nextButtons}`]: optionTextToWrite[0].savedValues[param], tempRegState:nextState[0].stateToChange }});
		return optionTextToWrite[0].savedValues[param];
	}catch(err){
		console.log(err);
	}
}

async function deleteTempRegistry(UID){
	try{
		await mongoClient.connect();
		const db = mongoClient.db("main");
		const collection = db.collection("temporaryRegistry");
		return await collection.deleteOne({"UID":UID});
	} catch {
		console.log("notExisting. Failed to delete")
	}
}

async function getCurrentTempRegistry(UID){
	await mongoClient.connect();
	const db = mongoClient.db("main");
	const collection = db.collection("temporaryRegistry");
	const findResult = await collection.find({"UID":UID}).toArray();
	return findResult[0];
}
function chunkArray(array, size) {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
}
async function createMessageToSend(currentStateOfRegistry){
		await mongoClient.connect();
		const db = mongoClient.db("main");
		const collection = db.collection("options");
		const collectionReplies = db.collection("replies");
		const nextContent = await collectionReplies.find({"state":currentStateOfRegistry}).toArray();
		let text = nextContent[0].textForNextMessage;
		if (nextContent[0].state!="endStage"){
			const findResult = await collection.find({"optionName":nextContent[0].nextButtons}).toArray();
		let keyboardToReturn = [];
		for (item in findResult[0].savedValues){
			keyboardToReturn.push({ text: findResult[0].savedValues[item], callback_data: String(item) });
		}
		return {text, keyboard:{
			reply_markup: {
				inline_keyboard: chunkArray(keyboardToReturn, 1)
			}
		}}} else {
			return {text};
		};
};

async function createTempRegistry(dataToWrite,UID){
	let enteredData = dataToWrite;
	let database = 'temporaryRegistry';
	await writeToDB({"tempRegState":"dateRegistered","UID":UID,"enteredData":enteredData}, database);
}
// Нажатие кнопок ~~~~~~~~~~~~~~~~

bot.on('callback_query', async msg => {
	const chatID = msg.from.id;
	const user = await getUsersFromDB(chatID);
	const buttonPressed = msg.data;
	const userState = await getUserState(chatID);
	const messageID = msg.message.message_id;
	console.log('chatID = ' + chatID);
	console.log('pressed = ' + buttonPressed);
	console.log("userState = " + userState);
	if (userState == 1) {
		bot.sendMessage(chatID, "Ожидаю номер автомобиля. Напишите текстом номер авто, в формате A111AA");
	}
	if (userState == 4) {
        res = calendar.clickButtonCalendar(msg);
        if (res !== -1) {
            await bot.sendMessage(msg.message.chat.id, "Дата рейса: " + res);
			await updateState(3,user[0]._id);
			await createTempRegistry({"date":res},chatID);
			const currTempReg = await getCurrentTempRegistry(chatID);
			const reply = await createMessageToSend(currTempReg.tempRegState);
			await bot.sendMessage(chatID, reply.text, reply.keyboard);
        }
    }
	if (userState == 3){
		const replytext = await updateTempRegistry(buttonPressed,chatID);
		const currTempReg = await getCurrentTempRegistry(chatID);
		const reply = await createMessageToSend(currTempReg.tempRegState);
		await bot.deleteMessage(chatID,messageID);
		await bot.sendMessage(msg.message.chat.id, "Выбрано: " + replytext);
		console.log(reply.keyboard);
		if (reply.keyboard){
			bot.sendMessage(chatID, reply.text, reply.keyboard);
		} else {
			bot.sendMessage(chatID, reply.text);
			updateState(5,user[0]._id);
		}
	}
	await bot.answerCallbackQuery(msg.id);
	try {
		closeDBConnection()
	} catch(err){
		console.log(err);
	}
});

// сообщение текстом. States: 1 - Ждём номер авто; 2 - не в процессе регистрации рейса; 3 - в процессе регистрации рейса; 4 - в календаре; 5 - ждём кол-во рейсов в чате
bot.on('message', async msg => {
	console.log(msg);
	const gotMessageId = msg.message_id;
	const message = msg.text;
	const chatID = msg.chat.id;
	const userExist = await checkUserState(chatID);
	if (!userExist){
		bot.sendMessage(chatID, 'Введите номер вашего автомобиля в формате 123');
		const newUser = {
			id: chatID,
			name: msg.chat.first_name,
			state: 1
		};
		await writeToDB(newUser,'users');
	} else {
		if (user[0].state == 6){// Доступ запрещён
			bot.sendMessage(chatID, "Доступ запрещён. Обратитесь к администратору");
		}
		if (msg.photo || msg.video_note || msg.video){
			bot.sendMessage(chatID, "Очень красиво. Для регистрации рейса используйте /add");
			return true;
		}
		if (msg.location){
			bot.sendMessage(chatID, "Хорошее место, всегда хотел там побывать. Для регистрации рейса используйте /add");
		}
		if (msg.voice){
			bot.sendMessage(chatID, "Прекрасный голос. Для регистрации рейса используйте /add");
			return true;
		}
		if (msg.sticker){
			bot.sendMessage(chatID, "Классный стикерпак. Добавлю себе. Для регистрации рейса используйте /add");
			return true;
		}
		const user = await getUsersFromDB(chatID);
		if (user[0].state == 1){ // Ждём номер автомобиля
			// const pattern = /^[А-Яа-я][0-9]{3}[А-Яа-я]{2}$/;
			const pattern = /^[0-9]{3}$/;
			if (pattern.test(msg.text)) {
				const updateUser = {
					state: 2,
					autoNo: msg.text
				};
				bot.sendMessage(chatID, 'Принято. Для регистрации рейса введите /add. Если в номере ошибка или он изменился (текущий: '+msg.text+'), используйте команду /number для изменения');
				await writeToDB(updateUser,'users',user[0]._id);
			} else {
				bot.sendMessage(chatID, "Неверный формат. Введите правильный номер");
			}
		}
		if (user[0].state == 2){ // Не в процессе регистрации рейса
			if (message=="/number"){
				bot.sendMessage(chatID, 'Введите номер вашего автомобиля в формате 123');
				updateState(1,user[0]._id);
			}
			if (message === "/add"){
				calendar.startNavCalendar(msg);
				updateState(4,user[0]._id);
			} else {
				bot.sendMessage(chatID, 'Для регистрации рейса введите /add');
			}
		}
		if (user[0].state == 3){// В процессе регистрации рейса
		if (message === "/cancel"){
			await deleteTempRegistry(chatID);
			bot.sendMessage(chatID, 'Регистрация нового рейса отменена. Что бы начать заново введите /add');
			updateState(2,user[0]._id);				
		} else {
			bot.sendMessage(chatID, 'Сначала завершите регистрацию рейса или отмените её с помощью команды /cancel');
		}
	}
	if (user[0].state == 4){// В календаре
		if (message === "/cancel"){
			await deleteTempRegistry(chatID);
			bot.sendMessage(chatID, 'Регистрация нового рейса отменена. Что бы начать заново введите /add');
			updateState(2,user[0]._id);				
		} else {
			bot.deleteMessage(chatID,gotMessageId);
			bot.sendMessage(chatID,"Сначала выберите дату");
		}	
	}
	if (user[0].state == 5){// Ждём количество рейсов
		const pattern = /^[0-9]{1,3}$/;
		if (parseInt(message) && pattern.test(message)){
			bot.sendMessage(chatID,"Регистрация рейса успешна. Что бы добавить ещё один рейс введите /add");
			updateState(2, user[0]._id);
			await endReg(chatID, parseInt(message));
		} else {
			bot.sendMessage(chatID,"Укажите количество рейсов цифрой!");
		}
	}
	}
	try {closeDBConnection()
	} catch(err){
		console.log(err);
	}
});