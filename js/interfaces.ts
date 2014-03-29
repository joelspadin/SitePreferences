interface ContentSettings {
	cookies: string;
	popups: string;
	javascript: string;
	notifications: string;
	plugins: string;
	images: string;
}

interface BaseMessage {
	action: string;
}

interface SaveMessage extends BaseMessage {
	settings: ContentSettings;
}
