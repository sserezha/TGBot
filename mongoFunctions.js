const MongoClient = require('mongodb').MongoClient;
const url = process.env.URL;
const mongoClient = new MongoClient(url);
const dotenv=require("dotenv").config();
async function createLoadingTempRegistry(dataToWrite,UID){
	let enteredData = dataToWrite;
	let database = 'temporaryRegistry';
	await writeToDB({"tempRegState":"endStage","UID":UID,"enteredData":enteredData,"rideType":"loading"}, database);
}

async function endReg(UID, ridesCount){
	await mongoClient.connect();
	const db= mongoClient.db("main");
	const collectionTemp = db.collection("temporaryRegistry");
	const collectionRegistry = db.collection("registry");
	const collectionUsers = db.collection("users");
	const user = await collectionUsers.find({id:UID}).toArray();
	const tempRegFull = await collectionTemp.find({UID:UID}).toArray();
	const tempReg = tempRegFull[0];
	let toWrite = {};
	let rideTypes = {
		loading: "Погрузка/Выгрузка",
		defaultRide: "Полный рейс"
	}
	if (tempReg.rideType == "defaultRide"){
	toWrite = {enteredData:
			{
				date:tempReg.enteredData.date,
				autoNo:user[0].autoNo,
				woodSpecies:tempReg.enteredData.loadins,
				sortiment:tempReg.enteredData.sortiments,
				rideFrom:tempReg.enteredData.loadouts,
				rideTo:tempReg.enteredData.destinations,
				ridesCount:ridesCount
			},
			rideType: rideTypes[tempReg.rideType],
			UID:UID
		}
	} else if (tempReg.rideType == "loading"){
		toWrite = {enteredData:
			{
				date:tempReg.enteredData.date,
				autoNo:user[0].autoNo,
				woodSpecies:'-',
				sortiment:"-",
				rideFrom:"-",
				rideTo:"-",
				ridesCount:ridesCount
			},
			rideType: rideTypes[tempReg.rideType],
			UID:UID
}
	}
		await collectionRegistry.insertOne(toWrite);
		await collectionTemp.deleteOne({UID:UID});
}

function generateCode() {
    min = Math.ceil(100000);
    max = Math.floor(999999);
    const code = Math.floor(Math.random() * (max - min + 1) + min);
    const codeStr = code.toString();
    const codeText = codeStr.slice(0,3) + '-' + codeStr.slice(3);
    return {code:code, codeText:codeText}
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

async function 	getCurrentTempRegistry(UID){
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

async function isAdmin(userID){
    await mongoClient.connect();
    const db = mongoClient.db("main");
    const users = db.collection("users");
    const user = await users.findOne({id:userID});
    if (user.adminFlag == 1) {
        return true;
    } else {
        return false;
    }
}

async function requestCode(chatID){
    const code = generateCode();
    await mongoClient.connect();
    const db = mongoClient.db("main");
    const users = db.collection("users");
    const user = await users.findOne({id:chatID});
    const phone = user.phone;
    const checkAdminResult = await isAdmin(chatID);
    if (phone && checkAdminResult){
        await users.updateOne({id:chatID},{$set:{code:code.code}});
        return {code:code.codeText};
    } else {
        return {keyboard:{
			reply_markup: {
				keyboard: 
                [
                    [{"text":"Поделиться номером", "callback_data":"share", request_contact: true}]
                ],resize_keyboard: true
			}
        }};
    }
};
async function createTempRegistry(dataToWrite,UID){
	let enteredData = dataToWrite;
	let database = 'temporaryRegistry';
	await writeToDB({"tempRegState":"dateRegistered","UID":UID,"enteredData":enteredData,"rideType":"defaultRide"}, database);
}
async function regUser(chatID, phone){
    await mongoClient.connect();
    const db = mongoClient.db("main");
    const users = db.collection("users");
    await users.updateOne({id:chatID},{$set:{phone:phone}});
};
async function getRidesForUser(UID){
	await mongoClient.connect();
	const db = mongoClient.db("main");
	const registry = db.collection("registry");
	let found = await registry.find({UID:UID}).sort({"enteredData.date":1}).toArray();
	let res = "Ваши рейсы: \n"
	let i=1;
	if (found.length>0){
		for (el in found){
			let strToAdd = i + ". " + found[el].rideType + ". Количество: " + found[el].enteredData.ridesCount + ", Дата: "+found[el].enteredData.date+"\n" 
			res=res+strToAdd;
			i++;
		}
		return res;
	} else {
		return "Не найдено зарегистрированных рейсов";
	} 
}

module.exports = {
    endReg,createTempRegistry,createMessageToSend,getCurrentTempRegistry,deleteTempRegistry,
    updateTempRegistry,getUsersFromDB,updateState,closeDBConnection,checkUserState,getUserState,writeToDB,requestCode,regUser,createLoadingTempRegistry, getRidesForUser
};