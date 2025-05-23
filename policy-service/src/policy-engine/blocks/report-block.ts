import { Report } from '../helpers/decorators/index.js';
import { PolicyComponentsUtils } from '../policy-components-utils.js';
import { IPolicyGetData, IPolicyReportBlock } from '../policy-engine.interface.js';
import { IImpactReport, IPolicyReport, IReport, IReportItem, IVCReport, LocationType, SchemaEntity, } from '@guardian/interfaces';
import { BlockActionError } from '../errors/index.js';
import { ChildrenType, ControlType, PropertyType } from '../interfaces/block-about.js';
import { PolicyInputEventType } from '../interfaces/index.js';
import { PolicyUser } from '../policy-user.js';
import { PolicyUtils } from '../helpers/utils.js';
import { ExternalEvent, ExternalEventType } from '../interfaces/external-event.js';
import { getVCField, VcDocument, VpDocument } from '@guardian/common';
import { FilterObject } from '@mikro-orm/core';

/**
 * Report block
 */
@Report({
    blockType: 'reportBlock',
    commonBlock: false,
    actionType: LocationType.LOCAL,
    about: {
        label: 'Report',
        title: `Add 'Report' Block`,
        post: true,
        get: true,
        children: ChildrenType.Special,
        control: ControlType.UI,
        input: [
            PolicyInputEventType.RunEvent,
            PolicyInputEventType.RefreshEvent,
        ],
        output: null,
        defaultEvent: false,
        properties: [
            {
                name: 'uiMetaData',
                label: 'UI',
                title: 'UI Properties',
                type: PropertyType.Group,
                properties: [{
                    name: 'vpSectionHeader',
                    label: 'VP section header',
                    title: 'VP section header',
                    type: PropertyType.Input
                }
                ]
            }]
    },
    variables: [],
})
export class ReportBlock {
    /**
     * Block state
     * @private
     */
    private readonly state: { [key: string]: any } = {
        lastValue: null
    };

    /**
     * Get username
     * @param did
     * @param map
     * @param userId
     */
    async getUserName(did: string, map: any, userId: string | null): Promise<string> {
        if (!did) {
            return null;
        }
        if (map[did]) {
            return map[did];
        } else {
            const ref = PolicyComponentsUtils.GetBlockRef<IPolicyReportBlock>(this);
            const curUser = await PolicyUtils.getUser(ref, did, userId);
            if (curUser) {
                map[did] = curUser.username;
                return map[did];
            } else {
                return did;
            }
        }
    }

    /**
     * Item user map
     * @param documents
     * @param map
     * @param userId
     */
    async itemUserMap(documents: any[], map: any, userId: string | null) {
        if (!documents) {
            return;
        }
        for (const element of documents) {
            if (element.multiple) {
                for (const document of element.document) {
                    document.username = await this.getUserName(document.username, map, userId);
                }
            } else {
                element.username = await this.getUserName(element.username, map, userId);
            }
            await this.itemUserMap(element.documents, map, userId);
        }
    }

    /**
     * Add report item by VP
     * @param report
     * @param variables
     * @param vp
     */
    private async addReportByVP(
        report: IReport,
        variables: any,
        vp: VpDocument & { transferAmount?: number, wasTransferNeeded?: boolean, tokenIds?: string[] },
        isMain: boolean = false
    ): Promise<IReport> {
        const vcs = vp.document.verifiableCredential || [];
        const mintIndex = Math.max(1, vcs.length - 1);
        const mint = vcs[mintIndex];
        report.vpDocument = {
            type: 'VP',
            title: 'Verifiable Presentation',
            tag: vp.tag,
            hash: vp.hash,
            issuer: vp.owner,
            username: vp.owner,
            document: vp
        }

        report.mintDocument = {
            type: 'VC',
            tokenId: vp.tokenIds?.join(', '),
            date: getVCField(mint, 'date'),
            expected: getVCField(mint, 'amount'),
            amount: String(vp.amount),
            transferAmount: String(vp.transferAmount),
            wasTransferNeeded: vp.wasTransferNeeded,
            tag: vp.tag,
            issuer: vp.owner,
            username: vp.owner,
            document: {
                owner: null,
                hash: null,
                type: null,
                policyId: null,
                tag: null,
                option: null,
                document: mint
            }
        }
        variables.actionId = mint.id;
        variables.actionSubjectId = mint.credentialSubject[0].id;

        report = await this.addReportByVCs(report, variables, vcs, vp);
        if (isMain) {
            report = await this.searchAdditionalDocuments(report, vcs, vp);
        }

        return report;
    }

    /**
     * Add report item by VCs
     * @param report
     * @param variables
     * @param vcs
     * @param vp
     */
    private async addReportByVCs(
        report: IReport,
        variables: any,
        vcs: any[],
        vp: VpDocument
    ): Promise<IReport> {
        const ref = PolicyComponentsUtils.GetBlockRef<IPolicyReportBlock>(this);

        const dataSource: any[] = [];
        const impacts: IImpactReport[] = [];
        const documentIds: string[] = [];
        const documentSubjectIds: string[] = [];
        for (let i = 0; i < vcs.length - 1; i++) {
            const doc = vcs[i];
            const credentialSubject = doc.credentialSubject[0];
            if (credentialSubject.type === 'TokenDataSource') {
                dataSource.push(doc);
            } else if (credentialSubject.type === 'ActivityImpact') {
                impacts.push({
                    type: 'VC',
                    impactType: getVCField(doc, 'impactType'),
                    label: getVCField(doc, 'label'),
                    description: getVCField(doc, 'description'),
                    amount: getVCField(doc, 'amount'),
                    unit: getVCField(doc, 'unit'),
                    date: getVCField(doc, 'date'),
                    tag: vp.tag,
                    issuer: vp.owner,
                    username: vp.owner,
                    document: {
                        owner: null,
                        hash: null,
                        type: null,
                        policyId: null,
                        tag: null,
                        option: null,
                        document: doc
                    }
                });
            } else {
                documentIds.push(doc.id);
                documentSubjectIds.push(credentialSubject.id);
            }
        }
        if (dataSource.length) {
            const messageIds = [];
            for (const item of dataSource) {
                const ids = item.credentialSubject[0].dataSource;
                if (Array.isArray(ids)) {
                    for (const id of ids) {
                        messageIds.push(id);
                    }
                } else {
                    messageIds.push(ids);
                }
            }

            const items = await ref.databaseServer.getVcDocuments<VcDocument>({ messageId: { $in: messageIds } }) as VcDocument[];

            for (const item of items) {
                documentIds.push(item.document.id);
                documentSubjectIds.push(item.document.credentialSubject[0].id);
            }
        }
        if (impacts.length) {
            report.impacts = impacts;
        }
        variables.documentId = documentIds[0];
        variables.documentSubjectId = documentSubjectIds[0];
        variables.documentIds = documentIds;
        variables.documentSubjectIds = documentSubjectIds;
        return report;
    }

    /**
     * Add report item by VC
     * @param report
     * @param variables
     * @param vcs
     * @param vp
     */
    private async addReportByVC(report: IReport, variables: any, vc: VcDocument): Promise<IReport> {
        const vcDocument: IVCReport = {
            type: 'VC',
            title: 'Verifiable Credential',
            tag: vc.tag,
            hash: vc.hash,
            issuer: vc.owner,
            username: vc.owner,
            document: vc
        }
        report.vcDocument = vcDocument;
        variables.documentId = vc.document.id;
        variables.documentSubjectId = vc.document.credentialSubject[0].id;

        return report;
    }

    /**
     * Add report item by Policy
     * @param report
     * @param variables
     * @param policy
     */
    private async addReportByPolicy(report: IReport, variables: any, policy: VcDocument): Promise<IReport> {
        const ref = PolicyComponentsUtils.GetBlockRef<IPolicyReportBlock>(this);

        const policyDocument: IPolicyReport = {
            type: 'VC',
            name: getVCField(policy.document, 'name'),
            description: getVCField(policy.document, 'description'),
            version: getVCField(policy.document, 'version'),
            tag: 'Policy Created',
            issuer: policy.owner,
            username: policy.owner,
            document: policy
        }
        report.policyDocument = policyDocument;

        const policyCreator = await ref.databaseServer.getVcDocument({
            type: SchemaEntity.STANDARD_REGISTRY,
            owner: policy.owner
        });

        if (policyCreator) {
            const policyCreatorDocument: IReportItem = {
                type: 'VC',
                title: 'StandardRegistry',
                description: 'Account Creation',
                visible: true,
                tag: 'Account Creation',
                issuer: policy.owner,
                username: policy.owner,
                document: policyCreator
            }
            report.policyCreatorDocument = policyCreatorDocument;
        }

        return report;
    }

    /**
     * Report user map
     * @param report
     * @param userId
     */
    private async reportUserMap(report: IReport, userId: string | null): Promise<IReport> {
        const map: any = {};
        if (report.vpDocument) {
            report.vpDocument.username = await this.getUserName(report.vpDocument.username, map, userId);
        }
        if (report.vcDocument) {
            report.vcDocument.username = await this.getUserName(report.vcDocument.username, map, userId);
        }
        if (report.mintDocument) {
            report.mintDocument.username = await this.getUserName(report.mintDocument.username, map, userId);
        }
        if (report.policyDocument) {
            report.policyDocument.username = await this.getUserName(report.policyDocument.username, map, userId);
        }
        if (report.policyCreatorDocument) {
            report.policyCreatorDocument.username = await this.getUserName(report.policyCreatorDocument.username, map, userId);
        }
        await this.itemUserMap(report.documents, map, userId);

        return report
    }

    /**
     * Search Additional Documents
     * @param report
     * @param vcs
     * @param vp
     */
    private async searchAdditionalDocuments(
        report: IReport,
        vcs: any[],
        vp: VpDocument
    ): Promise<IReport> {
        const ref = PolicyComponentsUtils.GetBlockRef<IPolicyReportBlock>(this);
        const messageIds = [];
        for (let i = 0; i < vcs.length - 1; i++) {
            const doc = vcs[i];
            const credentialSubject = doc.credentialSubject[0];
            if (credentialSubject.type === 'TokenDataSource' && credentialSubject.relationships) {
                if (Array.isArray(credentialSubject.relationships)) {
                    for (const relationship of credentialSubject.relationships) {
                        messageIds.push(relationship);
                    }
                } else {
                    messageIds.push(credentialSubject.relationships);
                }
            }
        }
        const additionalReports = [];
        if (messageIds.length) {
            const additionalVps: any[] = await ref.databaseServer.getVpDocuments<VpDocument>({
                messageId: { $in: messageIds },
                policyId: { $eq: ref.policyId }
            }) as VpDocument[];

            for (const additionalVp of additionalVps) {
                [additionalVp.serials, additionalVp.amount, additionalVp.error, additionalVp.wasTransferNeeded, additionalVp.transferSerials, additionalVp.transferAmount, additionalVp.tokenIds] = await ref.databaseServer.getVPMintInformation(additionalVp);
                const additionalReport = await this.addReportByVP({}, {}, additionalVp);
                additionalReports.push(additionalReport);
            }
        }
        if (vp.messageId) {
            const additionalVps: any[] = await ref.databaseServer.getVpDocuments<VpDocument>({
                'document.verifiableCredential.credentialSubject.type': { $eq: 'TokenDataSource' },
                'document.verifiableCredential.credentialSubject.relationships': { $eq: vp.messageId },
                'policyId': { $eq: ref.policyId }
            } as FilterObject<VpDocument>) as VpDocument[];

            for (const additionalVp of additionalVps) {
                [additionalVp.serials, additionalVp.amount, additionalVp.error, additionalVp.wasTransferNeeded, additionalVp.transferSerials, additionalVp.transferAmount, additionalVp.tokenIds] = await ref.databaseServer.getVPMintInformation(additionalVp);
                const additionalReport = await this.addReportByVP({}, {}, additionalVp);
                additionalReports.push(additionalReport);
            }
        }
        if (additionalReports.length) {
            report.additionalDocuments = additionalReports;
        }
        return report;
    }

    /**
     * Get block data
     * @param user
     * @param uuid
     */
    async getData(user: PolicyUser, uuid: string): Promise<IPolicyGetData> {
        const ref = PolicyComponentsUtils.GetBlockRef<IPolicyReportBlock>(this);
        try {
            const blockState = this.state[user.id] || {};
            if (!blockState.lastValue) {
                return {
                    id: ref.uuid,
                    blockType: ref.blockType,
                    actionType: ref.actionType,
                    readonly: (
                        ref.actionType === LocationType.REMOTE &&
                        user.location === LocationType.REMOTE
                    ),
                    hash: null,
                    uiMetaData: ref.options.uiMetaData,
                    data: null
                };
            }
            const hash = blockState.lastValue;

            const documents: IReportItem[] = [];

            const variables: any = {
                policyId: ref.policyId,
                owner: user.did
            };

            let report: IReport = {
                vpDocument: null,
                vcDocument: null,
                impacts: null,
                mintDocument: null,
                policyDocument: null,
                policyCreatorDocument: null,
                documents
            }

            const vp: any = await ref.databaseServer.getVpDocument({ hash, policyId: ref.policyId });
            if (vp) {
                [
                    vp.serials,
                    vp.amount,
                    vp.error,
                    vp.wasTransferNeeded,
                    vp.transferSerials,
                    vp.transferAmount,
                    vp.tokenIds,
                    vp.target
                ] = await ref.databaseServer.getVPMintInformation(vp);
                report = await this.addReportByVP(report, variables, vp, true);
            } else {
                const vc = await ref.databaseServer.getVcDocument({ hash, policyId: ref.policyId })
                if (vc) {
                    report = await this.addReportByVC(report, variables, vc);
                }
            }

            const policy = await ref.databaseServer.getVcDocument({
                type: SchemaEntity.POLICY,
                policyId: ref.policyId
            });

            if (policy) {
                report = await this.addReportByPolicy(report, variables, policy);
            }

            const reportItems = ref.getItems();
            for (const reportItem of reportItems) {
                const [documentsNotFound] = await reportItem.run(
                    documents,
                    variables
                );
                if (documentsNotFound) {
                    break;
                }
            }

            report = await this.reportUserMap(report, user.userId);
            if (report.additionalDocuments) {
                for (let i = 0; i < report.additionalDocuments.length; i++) {
                    report.additionalDocuments[i] = await this.reportUserMap(report.additionalDocuments[i], user.userId);
                }
            }

            return {
                id: ref.uuid,
                blockType: ref.blockType,
                actionType: ref.actionType,
                readonly: (
                    ref.actionType === LocationType.REMOTE &&
                    user.location === LocationType.REMOTE
                ),
                hash,
                uiMetaData: ref.options.uiMetaData,
                data: report
            };
        } catch (error) {
            throw new BlockActionError(error, ref.blockType, ref.uuid);
        }
    }

    /**
     * Set block data
     * @param user
     * @param data
     */
    async setData(user: PolicyUser, data: any) {
        const ref = PolicyComponentsUtils.GetBlockRef<IPolicyReportBlock>(this);
        try {
            const value = data.filterValue;
            const blockState = this.state[user.id] || {};
            blockState.lastValue = value;
            this.state[user.id] = blockState;
            PolicyComponentsUtils.ExternalEventFn(new ExternalEvent(ExternalEventType.Set, ref, user, {
                value
            }));
            ref.backup();
        } catch (error) {
            throw new BlockActionError(error, ref.blockType, ref.uuid);
        }
    }
}
