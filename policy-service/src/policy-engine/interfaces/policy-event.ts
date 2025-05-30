import { PolicyComponentsUtils } from '../policy-components-utils.js';
import { PolicyUtils } from '../helpers/utils.js';
import { AnyBlockType } from '../policy-engine.interface.js';
import { PolicyUser } from '../policy-user.js';
import { EventActor, PolicyInputEventType, PolicyOutputEventType } from './policy-event-type.js';

/**
 * Event callback type
 */
export type EventCallback<T> = (event: IPolicyEvent<T>) => void;

/**
 * Policy event
 */
export interface IPolicyEvent<T> {
    /**
     * Event type
     */
    type: PolicyInputEventType;
    /**
     * Input event type
     */
    inputType: PolicyInputEventType;
    /**
     * Output event type
     */
    outputType: PolicyOutputEventType;
    /**
     * Policy id
     */
    policyId: string;
    /**
     * Block tag
     */
    source: string;
    /**
     * Block id
     */
    sourceId: string;
    /**
     * Block tag
     */
    target?: string;
    /**
     * Block id
     */
    targetId?: string;
    /**
     * User
     */
    user?: PolicyUser;
    /**
     * Data
     */
    data?: T;
}

/**
 * Policy link class
 */
export class PolicyLink<T> {
    /**
     * Event type
     */
    public readonly type: PolicyInputEventType;
    /**
     * Input event type
     */
    public readonly inputType: PolicyInputEventType;
    /**
     * Output event type
     */
    public readonly outputType: PolicyOutputEventType;
    /**
     * Policy id
     */
    public readonly policyId: string;
    /**
     * Source block
     */
    public readonly source: AnyBlockType;
    /**
     * Target block
     */
    public readonly target: AnyBlockType;
    /**
     * Event actor
     */
    public readonly actor: EventActor;

    /**
     * Event callback
     * @private
     */
    private readonly callback?: EventCallback<T>;

    constructor(
        inputType: PolicyInputEventType,
        outputType: PolicyOutputEventType,
        source: AnyBlockType,
        target: AnyBlockType,
        actor: EventActor,
        fn: EventCallback<T>
    ) {
        this.type = inputType;
        this.inputType = inputType;
        this.outputType = outputType;
        this.policyId = source.policyId;
        this.source = source;
        this.target = target;
        this.actor = actor;
        this.callback = fn;
    }

    /**
     * Run event action
     * @param user
     * @param data
     */
    public run(user: PolicyUser, data: T): void {
        this.getUser(user, data).then((_user) => {
            const event: IPolicyEvent<T> = {
                type: this.type,
                inputType: this.inputType,
                outputType: this.outputType,
                policyId: this.policyId,
                source: this.source.tag,
                sourceId: this.source.uuid,
                target: this.target.tag,
                targetId: this.target.uuid,
                user: _user,
                data
            };
            this.callback.call(this.target, event);
        });
    }

    /**
     * Get owner
     * @param user
     * @param data
     * @private
     */
    private async getUser(user: PolicyUser, data: T): Promise<PolicyUser> {
        if (this.actor === EventActor.Owner) {
            return await this.getOwner(user, data);
        } else if (this.actor === EventActor.Issuer) {
            return await this.getIssuer(user, data);
        } else {
            return user;
        }
    }

    /**
     * Get owner
     * @param user
     * @param data
     * @private
     */
    private async getOwner(user: PolicyUser, data: any): Promise<PolicyUser> {
        if (!data) {
            return null;
        }
        if (data.data) {
            data = Array.isArray(data.data) ? data.data[0] : data.data;
        }
        if (user && user.equal(data.owner, data.group)) {
            return user;
        } else {
            return await PolicyComponentsUtils.GetPolicyUserByDID(data.owner, data.group, this.target, user.userId);
        }
    }

    /**
     * Get issuer
     * @param user
     * @param data
     * @private
     */
    private async getIssuer(user: PolicyUser, data: any): Promise<PolicyUser> {
        if (!data) {
            return null;
        }
        if (data.data) {
            data = Array.isArray(data.data) ? data.data[0] : data.data;
        }
        if (data) {
            let did = data.owner;
            if (data.document) {
                did = PolicyUtils.getDocumentIssuer(data.document);
            }
            if (user && user.equal(did, data.group)) {
                return user;
            } else {
                return await PolicyComponentsUtils.GetPolicyUserByDID(did, data.group, this.target, user.userId);
            }
        }
        return null;
    }

    /**
     * Destructor
     */
    public destroy(): void {
        return;
    }

    /**
     * Equals
     */
    public equals(link: PolicyLink<T>): boolean {
        return (
            this.target?.tag === link?.target?.tag &&
            this.source?.tag === link?.source?.tag &&
            this.inputType === link?.inputType &&
            this.outputType === link?.outputType &&
            this.actor === link?.actor
        );
    }
}
