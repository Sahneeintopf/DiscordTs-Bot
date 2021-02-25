module.exports = {
    name: "avatar",
    aliases: ['icon', 'pfp'],
    description:
        "Shows the users avatar, use @Username to show the avatar of the User",
    execute(message, args) {
        if (!message.mentions.users.size) {
            return message.channel.send(
                `${message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true,
                })}`
            );
        }
        const avatarList = message.mentions.users.map((user) => {
            return `${user.displayAvatarURL({
                format: "png",
                dynamic: true,
            })}`;
        });

        // send the entire array of strings as a message
        // by default, discord.js will `.join()` the array with `\n`
        message.channel.send(avatarList);
    },
};
