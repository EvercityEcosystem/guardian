import { ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { PolicyDTO } from './policies.dto.js';

export class WizardConfigDTO {
    @ApiProperty({
        type: 'string',
        required: true,
        isArray: true,
    })
    roles: string[];

    @ApiProperty({
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'topicDescription', 'policyTag'],
        properties: {
            name: {
                type: 'string'
            },
            description: {
                type: 'string'
            },
            topicDescription: {
                type: 'string'
            },
            policyTag: {
                type: 'string'
            }
        },
    })
    policy: any;

    @ApiProperty({
        type: 'array',
        additionalProperties: false,
        items: {
            type: 'object',
            additionalProperties: false,
            properties: {
                name: {
                    type: 'string'
                },
                iri: {
                    type: 'string'
                },
                isApproveEnable: {
                    type: 'boolean'
                },
                isMintSchema: {
                    type: 'boolean'
                },
                mintOptions: {
                    type: 'object',
                    properties: {
                        tokenId: {
                            type: 'string'
                        },
                        rule: {
                            type: 'string'
                        }
                    }
                },
                dependencySchemaIri: {
                    type: 'string'
                },
                relationshipsSchemaIri: {
                    type: 'string'
                },
                initialRolesFor: {
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                rolesConfig: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            role: {
                                type: 'string'
                            },
                            isApprover: {
                                type: 'boolean'
                            },
                            isCreator: {
                                type: 'boolean'
                            },
                            gridColumns: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        field: {
                                            type: 'string'
                                        },
                                        title: {
                                            type: 'string'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
        },
        isArray: true
    })
    schemas: any[];

    @ApiProperty({
        type: 'array',
        items: {
            type: 'object',
            additionalProperties: false,
            properties: {
                role: {
                    type: 'string'
                },
                mintSchemaIri: {
                    type: 'string'
                },
                viewOnlyOwnDocuments: {
                    type: 'boolean'
                }
            },
        },
        isArray: true
    })
    trustChain: any[];
}

@ApiExtraModels(WizardConfigDTO)
export class WizardConfigAsyncDTO {
    @ApiProperty({
        type: 'boolean',
        required: true,
    })
    saveState: boolean;

    @ApiProperty({
        type: () => WizardConfigDTO,
        required: true,
    })
    wizardConfig: WizardConfigDTO;
}

@ApiExtraModels(WizardConfigDTO)
export class WizardResultDTO {
    @ApiProperty({
        type: 'string',
        required: true,
    })
    policyId: string;

    @ApiProperty({
        type: () => WizardConfigDTO,
        required: true,
    })
    wizardConfig: WizardConfigDTO;
}

@ApiExtraModels(PolicyDTO)
export class WizardPreviewDTO {
    @ApiProperty({
        type: () => PolicyDTO,
        required: true,
    })
    policyConfig: PolicyDTO;

    @ApiProperty({
        type: () => WizardConfigDTO,
        required: true,
    })
    wizardConfig: WizardConfigDTO;
}
