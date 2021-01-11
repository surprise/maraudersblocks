const {MongoClient} = require('mongodb');

const Discord = require('discord.js');
const client = new Discord.Client();

const fs = require('fs');
const Pagination = require('discord-paginationembed');
const axios = require('axios');
axios.defaults.validateStatus = function () {
	return true;
};

// MongoDB
const mongoClient = new MongoClient(process.env.MONGODB_URL);

let collection = null;

async function connectToDB() {
	await mongoClient.connect();
	const database = mongoClient.db('maraudersblocks');
	collection = database.collection('data');
}

// Discord Bot
const cmds = {};

const cmdFiles = fs.readdirSync('./cmds/');

for (const file of cmdFiles) {
	cmds[file.replace('.js', '')] = require('./cmds/' + file);
}

client.on('ready', _ => {
	console.log('Discord bot ready!');
});

Object.defineProperty(Array.prototype, 'chunkInefficient', {
	value: function(chunkSize) {
		let array = this;
		return [].concat.apply([],
			array.map(function(elem, i) {
				return i % chunkSize ? [] : [array.slice(i, i + chunkSize)];
			})
		);
	}
});

let shared = {};

client.on('message', async message => {
	if (message.author.bot) return;
	if (!message.content.startsWith(process.env.BOT_PREFIX)) return;
	const command = message.content.replace(process.env.BOT_PREFIX, '').split(' ')[0];
	const args = message.content.replace(process.env.BOT_PREFIX, '').split(' ').splice(1);
	if (command === 'help') {
		const embeds = [];
		const group = Object.entries(cmds).chunkInefficient(5);
		for (const chunked_cmds of group) {
			const embed = new Discord.MessageEmbed()
				.setTitle('Page ' + (group.indexOf(chunked_cmds)+1));
			for (const [cmdName, cmd] of chunked_cmds) {
				let name = cmdName;
				if (cmd.aliases.length > 0) name = `${name} (${cmd.aliases.join(', ')})`;
				embed.addField(name, `${process.env.BOT_PREFIX}${name} ${cmd.usage}`);
			}
			embeds.push(embed);
		}
		return await new Pagination.Embeds()
			.setArray(embeds)
			.setAuthorizedUsers(message.author.id)
			.setChannel(message.channel)
			.build();
	}
	for (const [cmdName, cmd] of Object.entries(cmds)) {
		if (cmdName === command || cmd.aliases.includes(command)) {
			return await cmd.exec(message, args, shared);
		}
	}
	await message.channel.send('Invalid Command');
});

async function trackNames() {
	if (collection === null) return 1000;
	const dbEntries = await collection.find({}).toArray();
	if (dbEntries.length === 0) return 5000;
	const promises = [];
	for (const dbEntry of dbEntries) {
		if ((await shared.functions.isUUIDOnline(dbEntry.uuid)) === true) promises.push((await client.users.fetch(process.env.OWNER_ID)).send(dbEntry.usernames[0] + ' is online.'));
	}
	await Promise.all(promises);
	return 1000+((dbEntries.length+1)*3000);
}

async function trackNamesLoop() {
	const timeOut = await trackNames();

	setTimeout(trackNamesLoop, timeOut);
}

// Start all processes
async function start() {
	await connectToDB();
	shared = {
		'collection': collection,
		'functions': {
			getLastTimes: async (uuid) => {
				const hypixel_res = await axios.get(`https://api.hypixel.net/player?key=${process.env.HYPIXEL_API_KEY}&uuid=${uuid}`);
				if (hypixel_res.status !== 200 || hypixel_res.data === undefined || hypixel_res.data['player'] === null || hypixel_res.data['success'] !== true) return null;
				return {
					lastLogin: hypixel_res.data['player']['lastLogin'],
					lastLogout: hypixel_res.data['player']['lastLogout']
				};
			},
			isUUIDOnline: async (uuid) => {
				console.log('checking ' + uuid);
				const lastTimes = await shared.functions.getLastTimes(uuid);
				console.log('response not irregular');
				const dbEntry = await collection.findOne({uuid: uuid});
				if (dbEntry === null) return false;
				console.log(lastTimes.lastLogin, dbEntry.lastLogin, lastTimes.lastLogout, dbEntry.lastLogout);
				if (dbEntry.online === false && lastTimes.lastLogin > dbEntry.lastLogin) {
					await collection.updateOne({
						'uuid': uuid
					}, {
						$set: {
							'online': true,
							'lastLogin': lastTimes.lastLogin
						}
					});
					console.log('returned true');
					return true;
				} else if (dbEntry.online === true && lastTimes.lastLogout > dbEntry.lastLogout) {
					await collection.updateOne({
						'uuid': uuid
					}, {
						$set: {
							'online': false,
							'lastLogout': lastTimes.lastLogout
						}
					});
					console.log('returned false');
					return false;
				}
				console.log('neither');
				return false;
			},
			nameToUUID: async(name) => {
				const res = await axios.get(`https://api.ashcon.app/mojang/v1/user/${name}`);
				if (res.status === 404) return null;
				if (res.status !== 200) return undefined;
				return res.data['uuid'].replace(/-/g, '');
			}
		}
	};
	await client.login(process.env.DISCORD_TOKEN);
	trackNamesLoop();
}

start();

process.on('exit', async () => {
	await mongoClient.close();
});
