import youtubeSearch from "youtube-search";
import * as Discord from "discord.js";
import {
    AudioPlayer,
    AudioPlayerStatus,
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    VoiceConnectionStatus,
    getVoiceConnection,
    VoiceConnection,
    entersState,
} from "@discordjs/voice";
import credentials from "../../../credentials.json";
import ytdl from "ytdl-core";
import { logger } from "../../logger/logger.js";
import internal from "stream";
import { MessageActionRow } from "discord.js";

var opts: youtubeSearch.YouTubeSearchOptions = {
    maxResults: 1,
    key: credentials.youtubeApi,
};

const states: Discord.Collection<string, youtubePlayer> =
    new Discord.Collection();

class youtubePlayer {
    private readonly vc: Discord.VoiceChannel;
    readonly queue: string[] = [];
    private readonly player: AudioPlayer;
    public onConnectionDisconnect?: () => void;

    constructor(vc: Discord.VoiceChannel) {
        this.vc = vc;

        const connection = this.getConnection();
        this.player = createAudioPlayer();
        connection.subscribe(this.player);

        // Add listeners
        connection.on(VoiceConnectionStatus.Ready, this.onConnectionReady);
        connection.on(
            VoiceConnectionStatus.Disconnected,
            async (oldState, newState) => {
                if (connection) {
                    try {
                        await Promise.race([
                            entersState(
                                connection,
                                VoiceConnectionStatus.Signalling,
                                5_000
                            ),
                            entersState(
                                connection,
                                VoiceConnectionStatus.Connecting,
                                5_000
                            ),
                        ]);
                        // Seems to be reconnecting to a new channel - ignore disconnect
                    } catch (error) {
                        // Seems to be a real disconnect which SHOULDN'T be recovered from
                        connection.destroy();
                        this.player.stop();
                        if (!this.onConnectionDisconnect) return;
                        this.onConnectionDisconnect();
                    }
                }
            }
        );
        this.player.on(AudioPlayerStatus.Idle, this.onPlayerIdle.bind(this));

        this.player.on("error", (error: any) => {
            logger.log(
                "error",
                `Error: ${error.message} with resource ${error?.resource?.metadata?.title}`
            );
            this.player.stop();
        });
    }

    private getConnection(): VoiceConnection {
        let connection = getVoiceConnection(this.vc.guildId);

        if (!connection) {
            // Connect to the voice channel
            connection = joinVoiceChannel({
                channelId: this.vc.id,
                guildId: this.vc.guildId,
                adapterCreator: this.vc.guild.voiceAdapterCreator,
            });

            if (!connection) {
                logger.log(
                    "info",
                    "Couldn't acquire a connection to the voice channel"
                );
                throw "Couldn't acquire a connection to the voice channel";
            }
        }

        return connection;
    }

    private onConnectionReady() {
        logger.log("info", "Player is ready");
    }

    private onPlayerIdle() {
        this.playNextSong();
    }

    async youtubeSearch(text: string) {
        const searchResult = await youtubeSearch(text, opts);
        this.addToQueue(searchResult.results[0].link);
    }

    addToQueue(link: string) {
        this.queue.push(link);
        this.start();
    }

    private getStream(): internal.Readable | undefined {
        const link = this.queue.shift();
        if (!link) return;
        logger.log("info", `Playing song: ${link}`);
        return ytdl(link, {
            filter: "audioonly",
            highWaterMark: 1048576 / 4,
        });
    }

    private playNextSong() {
        const stream = this.getStream();
        if (!stream) return;
        this.player.play(createAudioResource(stream));
    }

    // TODO: Better name?
    start() {
        switch (this.player.state.status) {
            case AudioPlayerStatus.Idle: {
                this.playNextSong();
                break;
            }
            case AudioPlayerStatus.Paused: {
                this.skip();
                break;
            }
            case AudioPlayerStatus.Playing: {
                // Do nothing
                break;
            }
        }
    }

    skip() {
        this.playNextSong();
    }

    pause() {
        this.player.pause();
    }

    unpause() {
        this.player.unpause();
    }

    stop() {
        this.queue.splice(0);
        this.player.stop();
    }

    // TODO: remove
    fillQueue() {
        this.queue.push(
            "https://www.youtube.com/watch?v=mJS8xrafNdI",
            "https://www.youtube.com/watch?v=H4xE0u4OQcY",
            "https://www.youtube.com/watch?v=mJS8xrafNdI"
        );
        this.start();
    }
}

function getOrCreatePlayer(vc: Discord.VoiceChannel): youtubePlayer {
    let player = states.get(vc.guildId);

    if (!player) {
        player = new youtubePlayer(vc);
        player.onConnectionDisconnect = () => {
            logger.log("info", "player is disconnected. Trying to kill player");
            states.delete(vc.guildId);
            player = undefined;
        };
        states.set(vc.guildId, player);
    }

    return player;
}

export default {
    name: "youtube",
    args: true,
    aliases: ["yt", "play"],
    description: "Plays music from youtube",
    buttons() {},
    async execute(message: Discord.Message, args: string[]) {
        // Check if the user is in a voice channel
        const vc = message.member?.voice.channel;
        if (!(vc instanceof Discord.VoiceChannel)) {
            logger.log("info", "User is not in a voice channel.");
            return;
        }

        // Check if there were any arguments provided
        if (!args) {
            logger.log("info", "User did not provide arguments.");
            return;
        }

        // Check if there is only one argument
        if (args.length === 1) {
            switch (args[0]) {
                case "q": {
                    const player = states.get(vc.guildId);

                    if (!player) {
                        return;
                    }

                    const row = new MessageActionRow().addComponents(
                        new Discord.MessageButton()
                            .setCustomId("ping")
                            .setStyle("PRIMARY")
                            .setEmoji("▶️")
                    );

                    message.reply({
                        content: player.queue.join(" ") || "Empty",
                        components: [row],
                    });

                    break;
                }
                case "fill": {
                    const player = getOrCreatePlayer(vc);

                    player.fillQueue();
                    break;
                }
                case "pause": {
                    const player = states.get(vc.guildId);

                    if (!player) {
                        return;
                    }

                    player.pause();
                    break;
                }
                case "resume": {
                    const player = states.get(vc.guildId);

                    if (!player) {
                        return;
                    }

                    player.unpause();
                    break;
                }
                case "skip": {
                    const player = states.get(vc.guildId);

                    if (!player) {
                        return;
                    }

                    player.skip();
                    break;
                }
                case "stop": {
                    const player = states.get(vc.guildId);

                    if (!player) {
                        return;
                    }

                    player.stop();
                    break;
                }

                default: {
                    const player = getOrCreatePlayer(vc);

                    if (ytdl.validateURL(args[0])) {
                        player.addToQueue(args[0]);
                    } else {
                        await player.youtubeSearch(args.join(" "));
                    }
                }
            }
        } else {
            const player = getOrCreatePlayer(vc);

            await player.youtubeSearch(args.join(" "));
        }
    },
};
