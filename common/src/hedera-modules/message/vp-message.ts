import { VpDocument } from '../vcjs/vp-document.js';
import { Message } from './message.js';
import { IURL, UrlType } from './url.interface.js';
import { MessageAction } from './message-action.js';
import { MessageType } from './message-type.js';
import { VpMessageBody } from './message-body.interface.js';
import { Hashing } from '../hashing.js';
import { IPFS } from '../../helpers/index.js';
import { ITopicMessage } from '../../topic-listener/topic-listener.js';

/**
 * VP message
 */
export class VPMessage extends Message {
    /**
     * VP document
     */
    public vpDocument: VpDocument;
    /**
     * Document
     */
    public document: any;
    /**
     * Hash
     */
    public hash: string;
    /**
     * Issuer
     */
    public issuer: string;
    /**
     * Relationships
     */
    public relationships: string[];
    /**
     * User Role
     */
    public userMessageId: string;

    constructor(action: MessageAction) {
        super(action, MessageType.VPDocument);
    }

    /**
     * Set document
     * @param document
     */
    public setDocument(document: VpDocument): void {
        this.vpDocument = document;
        this.document = document.getDocument();
        this.hash = document.toCredentialHash();
        this.issuer = document.getIssuerDid();
    }

    /**
     * Set relationships
     * @param ids
     */
    public setRelationships(ids: string[]): void {
        this.relationships = ids;
        if (this.userMessageId) {
            if (this.relationships) {
                if (this.relationships.indexOf(this.userMessageId) === -1) {
                    this.relationships.push(this.userMessageId);
                }
            } else {
                this.relationships = [this.userMessageId];
            }
        }
    }

    /**
     * Set relationships
     * @param messageId
     */
    public setUser(messageId: string): void {
        this.userMessageId = messageId;
        if (this.userMessageId) {
            if (this.relationships) {
                if (this.relationships.indexOf(this.userMessageId) === -1) {
                    this.relationships.push(this.userMessageId);
                }
            } else {
                this.relationships = [this.userMessageId];
            }
        }
    }

    /**
     * Get document
     */
    public getDocument(): any {
        return this.document;
    }

    /**
     * To message object
     */
    public override toMessageObject(): VpMessageBody {
        return {
            id: null,
            status: null,
            type: this.type,
            action: this.action,
            lang: this.lang,
            issuer: this.issuer,
            relationships: this.relationships,
            cid: this.getDocumentUrl(UrlType.cid),
            uri: this.getDocumentUrl(UrlType.url),
        };
    }

    /**
     * To documents
     */
    public async toDocuments(): Promise<ArrayBuffer[]> {
        const json = JSON.stringify(this.document);
        const buffer = Buffer.from(json);
        return [buffer];
    }

    /**
     * Load documents
     * @param documents
     */
    public loadDocuments(documents: string[]): VPMessage {
        this.document = JSON.parse(documents[0]);
        return this;
    }

    /**
     * From message
     * @param message
     */
    public static from(data: ITopicMessage): VPMessage {
        if (!data) {
            throw new Error('Message Object is empty');
        }
        if (!data.message) {
            throw new Error('Message Object is empty');
        }

        const json = JSON.parse(data.message);
        const message = VPMessage.fromMessageObject(json);
        message.setAccount(data.owner);
        message.setIndex(data.sequenceNumber);
        message.setId(data.consensusTimestamp);
        message.setTopicId(data.topicId);
        return message;
    }

    /**
     * From message
     * @param message
     */
    public static fromMessage(message: string): VPMessage {
        if (!message) {
            throw new Error('Message Object is empty');
        }

        const json = JSON.parse(message);
        return VPMessage.fromMessageObject(json);
    }

    /**
     * From message objects
     * @param json
     */
    public static fromMessageObject(json: VpMessageBody): VPMessage {
        if (!json) {
            throw new Error('JSON Object is empty');
        }

        let message = new VPMessage(json.action);
        message = Message._fromMessageObject(message, json);
        message._id = json.id;
        message._status = json.status;
        message.issuer = json.issuer;
        message.relationships = json.relationships;
        const urls = [{
            cid: json.cid,
            url: IPFS.IPFS_PROTOCOL + json.cid
        }]
        message.setUrls(urls);
        return message;
    }

    /**
     * Get URL
     */
    public override getUrl(): IURL {
        return this.getUrls()[0];
    }

    /**
     * Validate
     */
    public override validate(): boolean {
        return true;
    }

    /**
     * Get document URL
     * @param type
     */
    public getDocumentUrl(type: UrlType): string | null {
        return this.getUrlValue(0, type);
    }

    /**
     * To hash
     */
    public override toHash(): string {
        const map: any = {
            status: this._status,
            type: this.type,
            action: this.action,
            lang: this.lang,
            issuer: this.issuer,
            relationships: this.relationships,
            hash: this.hash
        }
        const json: string = JSON.stringify(map);
        const hash: Uint8Array = Hashing.sha256.digest(json);
        return Hashing.base58.encode(hash);
    }

    /**
     * Relationship message
     */
    public getRelationships(): string[] {
        return this.relationships || [];
    }

    /**
     * To JSON
     */
    public override toJson(): any {
        const result = super.toJson();
        result.issuer = this.issuer;
        result.hash = this.hash;
        result.relationships = this.relationships;
        result.document = this.document;
        return result;
    }

    public static fromJson(json: any): VPMessage {
        if (!json) {
            throw new Error('JSON Object is empty');
        }
        const result = Message._fromJson(new VPMessage(json.action), json);
        result.issuer = json.issuer;
        result.hash = json.hash;
        result.relationships = json.relationships;
        result.document = json.document;
        return result;
    }

    /**
     * Get User DID
     */
    public override getOwner(): string {
        return this.issuer;
    }
}
