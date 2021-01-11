module.exports = {
	exec: async (message, args, shared) => {
		if (args.length === 0) return message.channel.send(`No username specified, usage: ${process.env.BOT_PREFIX}track ${this.usage}`);
		const existsInDB = (await shared.collection.countDocuments({
			'usernames': {$in: [args[0]]}
		}, {limit: 1})) > 0;
		if (existsInDB) {
			await shared.collection.deleteOne({'usernames': {$in: [args[0]]}});
			return message.channel.send('Stopped tracking ' + args[0]);
		} else {
			return message.channel.send('Username wasn\'t in db');
		}

	},
	aliases: [],
	usage: '<username>'
};
