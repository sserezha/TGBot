const dotenv=require("dotenv").config();
const { localsName } = require('ejs');
const { constants } = require('fs/promises');
const telegramApi = require('node-telegram-bot-api');
const Calendar = require('telegram-inline-calendar');
const { Collection } = require('mongodb');
const token = process.env.TOKEN;
const bot = new telegramApi(token, {polling: true});
const express = require('express');
const app = express();
const port = 3000;
const mongoFunctions = require("./mongoFunctions");

function generateCode() {
    min = Math.ceil(100000);
    max = Math.floor(999999);
    return Math.floor(Math.random() * (max - min + 1) + min); 
  }

app.use(express.json());

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});


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
		bot.sendMessage(chatID, "Ожидаю номер автомобиля. Напишите текстом номер авто, в формате трёх цифр");
	}
	if (userState == 4) {
        res = calendar.clickButtonCalendar(msg);
        if (res !== -1) {
            await bot.sendMessage(msg.message.chat.id, "Дата рейса: " + res);
			await mongoFunctions.updateState(3,user[0]._id);
			await mongoFunctions.createTempRegistry({"date":res},chatID);
			const currTempReg = await mongoFunctions.getCurrentTempRegistry(chatID);
			const reply = await mongoFunctions.createMessageToSend(currTempReg.tempRegState);
			await bot.sendMessage(chatID, reply.text, reply.keyboard);
        }
    }
	if (userState == 3){
		const replytext = await mongoFunctions.updateTempRegistry(buttonPressed,chatID);
		const currTempReg = await mongoFunctions.getCurrentTempRegistry(chatID);
		const reply = await mongoFunctions.createMessageToSend(currTempReg.tempRegState);
		await bot.deleteMessage(chatID,messageID);
		await bot.sendMessage(msg.message.chat.id, "Выбрано: " + replytext);
		console.log(reply.keyboard);
		if (reply.keyboard){
			bot.sendMessage(chatID, reply.text, reply.keyboard);
		} else {
			bot.sendMessage(chatID, reply.text);
			mongoFunctions.updateState(5,user[0]._id);
		}
	}
	await bot.answerCallbackQuery(msg.id);
	try {
		mongoFunctions.closeDBConnection()
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
	const userExist = await mongoFunctions.checkUserState(chatID);
	if (!userExist){
		bot.sendMessage(chatID, 'Введите номер вашего автомобиля в формате трёх цифр');
		const newUser = {
			id: chatID,
			name: msg.chat.first_name,
			state: 1
		};
		await mongoFunctions.writeToDB(newUser,'users');
	} else {
		const user = await mongoFunctions.getUsersFromDB(chatID);
		const responsesForBadMessages = {
			photo: "Очень красиво. Для регистрации рейса используйте /add",
			video_note: "Очень красиво. Для регистрации рейса используйте /add",
			video: "Очень красиво. Для регистрации рейса используйте /add",
			location: "Хорошее место, всегда хотел там побывать. Для регистрации рейса используйте /add",
			voice: "Прекрасный голос. Для регистрации рейса используйте /add",
			sticker: "Классный стикерпак. Добавлю себе. Для регистрации рейса используйте /add"
		};
		for (const key in responsesForBadMessages) {
			if (msg[key]) {
				bot.sendMessage(chatID, responsesForBadMessages[key]);
				return true;
			}
		}
		
		if (user[0].state == 1){ // Ждём номер автомобиля
			// const pattern = /^[А-Яа-я][0-9]{3}[А-Яа-я]{2}$/;
			const pattern = /^[0-9]{3}$/;
			if (pattern.test(msg.text)) {
				const updateUser = {
					state: 2,
					autoNo: msg.text
				};
				bot.sendMessage(chatID, 'Принято. Для регистрации рейса введите /add. Если в номере ошибка или он изменился (текущий: '+msg.text+'), используйте команду /number для изменения');
				await mongoFunctions.writeToDB(updateUser,'users',user[0]._id);
			} else {
				bot.sendMessage(chatID, "Неверный формат. Введите правильный номер");
			}
		}
		if (user[0].state == 2){ // Не в процессе регистрации рейса
			if (message === "/number"){
				bot.sendMessage(chatID, 'Введите номер вашего автомобиля в формате трёх цифр');
				mongoFunctions.updateState(1,user[0]._id);
			}
			if (message === "/add"){
				calendar.startNavCalendar(msg);
				mongoFunctions.updateState(4,user[0]._id);
			} else {
				bot.sendMessage(chatID, 'Для регистрации рейса введите /add');
			}
		}
		if (user[0].state == 3){// В процессе регистрации рейса
		if (message === "/cancel"){
			await mongoFunctions.deleteTempRegistry(chatID);
			bot.sendMessage(chatID, 'Регистрация нового рейса отменена. Что бы начать заново введите /add');
			mongoFunctions.updateState(2,user[0]._id);				
		} else {
			bot.sendMessage(chatID, 'Сначала завершите регистрацию рейса или отмените её с помощью команды /cancel');
		}
	}
	if (user[0].state == 4){// В календаре
		if (message === "/cancel"){
			await mongoFunctions.deleteTempRegistry(chatID);
			bot.sendMessage(chatID, 'Регистрация нового рейса отменена. Что бы начать заново введите /add');
			mongoFunctions.updateState(2,user[0]._id);				
		} else {
			bot.deleteMessage(chatID,gotMessageId);
			bot.sendMessage(chatID,"Сначала выберите дату");
		}	
	}
	if (user[0].state == 5){// Ждём количество рейсов
		const pattern = /^[0-9]{1,3}$/;
		if (parseInt(message) && pattern.test(message)){
			bot.sendMessage(chatID,"Регистрация рейса успешна. Что бы добавить ещё один рейс введите /add");
			mongoFunctions.updateState(2, user[0]._id);
			await mongoFunctions.endReg(chatID, parseInt(message));
		} else {
			bot.sendMessage(chatID,"Укажите количество рейсов цифрой!");
		}
	}
	}
	try {mongoFunctions.closeDBConnection()
	} catch(err){
		console.log(err);
	}
});