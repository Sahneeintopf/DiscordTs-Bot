import { argumentWrapper } from "../../interfaces/wrapperObject";
import * as Discord from "discord.js";
import { token } from "../../../credentials.json";

module.exports = {
    name: "poker",
    description: "Play poker",
    async execute(message: Discord.Message, context: argumentWrapper) {
        if (!message.member?.voice.channel){
            return;
        }
        const voiceChannel: Discord.VoiceChannel = message.member.voice.channel;
        const fetch = require("node-fetch");
        const response = await fetch(
            `https://discord.com/api/v8/channels/${voiceChannel}/invites`,
            {
                method: "POST",
                body: JSON.stringify({
                    max_age: 86400,
                    max_uses: 0,
                    target_application_id: "755827207812677713", // Poker
                    target_type: 2,
                    temporary: false,
                    validate: null,
                }),
                headers: {
                    Authorization: `Bot ${token}`,
                    "Content-Type": "application/json",
                },
            }
        );
        const invite = await response.json();

        if (!invite.code) {
            message.channel.send("Cannot start Poker, please retry");
        } else {
            message.channel.send(
                `Click on the Link to start playing Poker Together:\n> https://discord.com/invite/${invite.code}`
            );
        }
    },
};
