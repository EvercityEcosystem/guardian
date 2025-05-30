import { RawToken } from '@indexer/interfaces';
import { Entity, Property, PrimaryKey, SerializedPrimaryKey, Unique, Index } from '@mikro-orm/core';
import { ObjectId } from '@mikro-orm/mongodb';

@Entity()
@Unique({ name: 'token_id', properties: ['tokenId'] })
@Index({ name: 'status', properties: ['status'] })
@Index({ name: 'last_update', properties: ['lastUpdate'] })
@Index({ name: 'has_next', properties: ['hasNext'] })
@Index({ name: 'priority_date', properties: ['priorityDate'] })
@Index({ name: 'priority_status_date', properties: ['priorityStatusDate'] })
@Index({ name: 'priority_date_and_token_id', properties: ['priorityDate', 'tokenId'] })
export class TokenCache implements RawToken {
    @PrimaryKey()
    _id: ObjectId;

    @SerializedPrimaryKey()
    id!: string;

    @Property()
    tokenId: string;

    @Property()
    status: string;

    @Property()
    createdTimestamp: string;

    @Property()
    modifiedTimestamp: string;

    @Property()
    lastUpdate: number;

    @Property()
    serialNumber: number;

    @Property()
    hasNext: boolean;

    @Property()
    name: string;

    @Property()
    symbol: string;

    @Property()
    type: string;

    @Property()
    treasury: string;

    @Property()
    memo: string;

    @Property()
    totalSupply: any;

    @Property({ nullable: true })
    decimals?: string;

    @Property({ nullable: true })
    priorityDate?: Date | null;

    @Property({ nullable: true })
    priorityStatus?: string;

    @Property({ nullable: true })
    priorityStatusDate?: Date | null;

    @Property({ nullable: true })
    priorityTimestamp?: number;
}
