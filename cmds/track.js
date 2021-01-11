module.exports = {
	exec: async (message, args, shared) => {
		if (args.length === 0) return message.channel.send(`No username specified, usage: ${process.env.BOT_PREFIX}track ${this.usage}`);
		const uuid = await shared.functions.nameToUUID(args[0]);
		if (uuid === null) return message.channel.send('That name is not on an account');
		if (uuid === undefined) return message.channel.send('There was an error converting the uuid for that name');
		const existsInDB = (await shared.collection.countDocuments({
			'usernames': {$in: [args[0]]}
		}, {limit: 1})) > 0;
		if (existsInDB) await shared.collection.deleteOne({'usernames': {$in: [args[0]]}});
		const lastTimes = await shared.functions.getLastTimes(uuid);
		await shared.collection.insertOne({
			'timestamp': Date.now(),
			'usernames': [args[0]],
			'uuid': uuid,
			'online': false,
			'lastLogin': lastTimes.lastLogin,
			'lastLogout': lastTimes.lastLogout
		});
		return message.channel.send('Now tracking ' + args[0]);
	},
	aliases: [],
	usage: '<username>'
};
