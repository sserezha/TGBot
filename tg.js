const dotenv=require("dotenv").config();
const { localsName } = require('ejs');
const { constants } = require('fs/promises');
const telegramApi = require('node-telegram-bot-api');
const Calendar = require('telegram-inline-calendar');
const { Collection } = require('mongodb');
const token = process.env.TOKEN;
const bot = new telegramApi(token, {polling: true});
const mongoFunctions = require("./mongoFunctions");
const { phrases, responsesForBadMessages } = require("./phrases");

const calendar = new Calendar(bot, {
    date_format: 'YYYY-MM-DD',
    language: 'ru'
});
// Нажатие кнопок ~~~~~~~~~~~~~~~~
bot.on('callback_query', async msg => {
	const chatID = msg.from.id;
	const user = await mongoFunctions.getUsersFromDB(chatID);
	const buttonPressed = msg.data;
	const userState = await mongoFunctions.getUserState(chatID);
	const messageID = msg.message.message_id;
	console.log('chatID = ' + chatID);
	console.log('pressed = ' + buttonPressed);
	console.log("userState = " + userState);
	if (userState == 1) {
		bot.sendMessage(chatID, phrases.autoNoWait);
	}
	if (userState == 4) {
        res = calendar.clickButtonCalendar(msg);
        if (res !== -1) {
            await bot.sendMessage(msg.message.chat.id, "Дата рейса: " + res);
			await mongoFunctions.updateState(3,user._id);
			await mongoFunctions.createTempRegistry({"date":res},chatID);
			const currTempReg = await mongoFunctions.getCurrentTempRegistry(chatID);
			const reply = await mongoFunctions.createMessageToSend(currTempReg.tempRegState);
			await bot.sendMessage(chatID, reply.text, reply.keyboard);
			console.log(reply.keyboard);
        }
    }
	if (userState == 7) {
        res = calendar.clickButtonCalendar(msg);
        if (res !== -1) {
            await bot.sendMessage(msg.message.chat.id, "Дата погрузки/выгрузки: " + res);
			await mongoFunctions.updateState(5,user._id);
			await mongoFunctions.createLoadingTempRegistry({"date":res},chatID);
			const currTempReg = await mongoFunctions.getCurrentTempRegistry(chatID);
			const reply = await mongoFunctions.createMessageToSend(currTempReg.tempRegState);
			await bot.sendMessage(chatID, reply.text);
        }
    }
	if (userState == 3){
		const replytext = await mongoFunctions.updateTempRegistry(buttonPressed,chatID);
		const currTempReg = await mongoFunctions.getCurrentTempRegistry(chatID);
		const reply = await mongoFunctions.createMessageToSend(currTempReg.tempRegState);
		await bot.deleteMessage(chatID,messageID);
		await bot.sendMessage(msg.message.chat.id, "Выбрано: " + replytext);
		if (reply.keyboard){
			bot.sendMessage(chatID, reply.text, reply.keyboard);
		} else {
			bot.sendMessage(chatID, reply.text);
			mongoFunctions.updateState(5,user._id);
		}
	} else {
		bot.sendMessage(chatID, phrases.notACommand);
	}
	await bot.answerCallbackQuery(msg.id);
	try {
		mongoFunctions.closeDBConnection()
	} catch(err){
		console.log(err);
	}
});

// сообщение текстом. States: 1 - Ждём номер авто; 2 - не в процессе регистрации рейса; 3 - в процессе регистрации рейса; 4 - в календаре;
// 5 - ждём кол-во рейсов в чате; 6 - banned; 7 - Создание погрузки/выгрузки (календарь)
bot.on('message', async msg => {
	console.log(msg);
	const gotMessageId = msg.message_id;
	const message = msg.text;
	const chatID = msg.chat.id;
	const userExist = await mongoFunctions.checkUserState(chatID);
	const user = await mongoFunctions.getUsersFromDB(chatID);
	if (!userExist){
		bot.sendMessage(chatID, phrases.autoNoWait);
		mongoFunctions.initUser(chatID, msg.chat.first_name)
	} else {
		if (msg.contact){
			const delKeyboard = {
				reply_markup:{
					remove_keyboard:true
				}
			}
			await bot.sendMessage(chatID,phrases.successUserReg,delKeyboard);
			await mongoFunctions.regUser(chatID, msg.contact.phone_number);
			return true;
		}
		if (user.state == 6){// Доступ запрещён
			bot.sendMessage(chatID, phrases.accessDnied);
			return true;
		}

		for (const key in responsesForBadMessages) {
			if (msg[key]) {
				bot.sendMessage(chatID, responsesForBadMessages[key]);
				return true;
			};
		}
		if (message== "/help"){
			await bot.sendMessage(chatID, phrases.helpPhrase);
			return true;
		}
		if (message == "/code"){
			const gotCode = await mongoFunctions.requestCode(chatID);
			if (gotCode.code){
				await bot.sendMessage(chatID,"Код для входа: "+gotCode.code);
			} else {
				await bot.sendMessage(chatID, phrases.contactRequest , gotCode.keyboard);
			}
			return true;
		}

		if (user.state == 1){ // Ждём номер автомобиля
			// const pattern = /^[А-Яа-я][0-9]{3}[А-Яа-я]{2}$/;
			const pattern = /^[0-9]{3}$/;
			if (pattern.test(message)) {
				mongoFunctions.updateAutoNo(chatID, message);
				mongoFunctions.updateState(2,user._id)
				bot.sendMessage(chatID, 'Принято. Для регистрации рейса введите /add. Для указания погрузки/выгрузки введите /load. Если в номере ошибка или он изменился (текущий: '+message+'), используйте команду /number для изменения');
			} else {
				bot.sendMessage(chatID, phrases.wrongAutoNo);
			}
		}
	
		if (user.state == 2){ // Не в процессе регистрации рейса
			if (message === "/number"){
				bot.sendMessage(chatID, phrases.autoNoWait);
				mongoFunctions.updateState(1,user._id);
			} else {
				if (message === "/add"){
					calendar.startNavCalendar(msg);
					mongoFunctions.updateState(4,user._id);
					return true;
				} if (message === "/load"){
					calendar.startNavCalendar(msg)
					mongoFunctions.updateState(7,user._id);
					return true;
				} if (message === "/myrides"){
					let ridesToShow = await mongoFunctions.getRidesForUser(chatID);
					bot.sendMessage(chatID, ridesToShow);
					return true;
				} else {
					bot.sendMessage(chatID, phrases.notACommand);
				}
			}
		}
		if (user.state == 3){// В процессе регистрации рейса
			if (message === "/cancel"){
				await mongoFunctions.deleteTempRegistry(chatID);
				bot.sendMessage(chatID, phrases.cancel);
				mongoFunctions.updateState(2,user._id);				
			} else {
				bot.sendMessage(chatID, phrases.whileRegisteringRaid);
			}
		}
		if (user.state == 4 || user.state == 7){// В календаре; 7 - календарь для /load
			if (message === "/cancel"){
				await mongoFunctions.deleteTempRegistry(chatID);
				bot.sendMessage(chatID, phrases.cancel);
				mongoFunctions.updateState(2,user._id);				
			} else {
				try { bot.deleteMessage(chatID,gotMessageId);}
				catch(err){console.log(err)}
				bot.sendMessage(chatID, phrases.whileRegisteringRaid);
			}
		}
		if (user.state == 5){// Ждём количество рейсов
			const pattern = /^[0-9]{1,3}$/;
			if (parseInt(message) && pattern.test(message)){
				bot.sendMessage(chatID, phrases.successRaidReg);
				mongoFunctions.updateState(2, user._id);
				await mongoFunctions.endReg(chatID, parseInt(message));
			} else {
				if (message == "/cancel"){
					await mongoFunctions.deleteTempRegistry(chatID);
					bot.sendMessage(chatID, phrases.cancel);
					mongoFunctions.updateState(2,user._id);				
				} else {
					bot.sendMessage(chatID, phrases.wrongRidesCount);
				}
			}
		}
	}
	mongoFunctions.closeDBConnection();
});