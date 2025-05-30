import { Permissions, TaskAction } from '@guardian/interfaces';
import { IAuthUser, PinoLogger, RunFunctionAsync } from '@guardian/common';
import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Param, Post, Put, Req } from '@nestjs/common';
import { ApiBody, ApiExtraModels, ApiInternalServerErrorResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CredentialsDTO, DidDocumentDTO, DidDocumentStatusDTO, DidDocumentWithKeyDTO, DidKeyStatusDTO, InternalServerErrorDTO, ProfileDTO, TaskDTO } from '#middlewares';
import { Auth, AuthUser } from '#auth';
import { CacheService, getCacheKey, Guardians, InternalException, ServiceError, TaskManager, UseCache } from '#helpers';
import { CACHE, PREFIXES } from '#constants';

@Controller('profiles')
@ApiTags('profiles')
export class ProfileApi {
    constructor(private readonly cacheService: CacheService, private readonly logger: PinoLogger) {
    }

    /**
     * Get user profile.
     */
    @Get('/:username/')
    @Auth(Permissions.PROFILES_USER_READ)
    @ApiOperation({
        summary: 'Returns user account info.',
        description: 'Returns user account information. For users with the Standard Registry role it also returns address book and VC document information.',
    })
    @ApiParam({
        name: 'username',
        type: String,
        description: 'The name of the user for whom to fetch the information',
        required: true,
        example: 'username'
    })
    @ApiOkResponse({
        description: 'Successful operation.',
        type: ProfileDTO
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @ApiExtraModels(ProfileDTO, InternalServerErrorDTO)
    @HttpCode(HttpStatus.OK)
    @UseCache()
    async getProfile(
        @AuthUser() user: IAuthUser
    ): Promise<ProfileDTO> {
        try {
            const guardians = new Guardians();
            return await guardians.getProfile(user);
        } catch (error) {
            await InternalException(error, this.logger, user.id);
        }
    }

    /**
     * Update user profile
     */
    @Put('/:username')
    @Auth(
        Permissions.PROFILES_USER_UPDATE,
        // UserRole.STANDARD_REGISTRY,
        // UserRole.USER,
        // UserRole.AUDITOR
    )
    @ApiOperation({
        summary: 'Sets Hedera credentials for the user.',
        description: 'Sets Hedera credentials for the user. For users with the Standard Registry role it also creates an address book.'
    })
    @ApiParam({
        name: 'username',
        type: String,
        description: 'The name of the user for whom to update the information.',
        required: true,
        example: 'username'
    })
    @ApiBody({
        description: 'Object that contains the Hedera account data.',
        required: true,
        type: CredentialsDTO
    })
    @ApiOkResponse({
        description: 'Created.',
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @ApiExtraModels(CredentialsDTO, InternalServerErrorDTO)
    @HttpCode(HttpStatus.NO_CONTENT)
    async setUserProfile(
        @AuthUser() user: IAuthUser,
        @Body() profile: any,
        @Req() req
    ): Promise<void> {
        const username: string = user.username;
        const guardians = new Guardians();
        try {
            await guardians.createUserProfileCommon(user, username, profile);
        } catch (error) {
            throw new HttpException(error.message, HttpStatus.UNAUTHORIZED);
        }

        const invalidedCacheTags = [`/${PREFIXES.PROFILES}/${username}`];

        await this.cacheService.invalidate(getCacheKey([req.url, ...invalidedCacheTags], user))
    }

    /**
     * Update user profile (async)
     */
    @Put('/push/:username')
    @Auth(
        Permissions.PROFILES_USER_UPDATE,
        // UserRole.STANDARD_REGISTRY,
        // UserRole.USER,
        // UserRole.AUDITOR
    )
    @ApiOperation({
        summary: 'Sets Hedera credentials for the user.',
        description: 'Sets Hedera credentials for the user. For users with the Standard Registry role it also creates an address book.'
    })
    @ApiParam({
        name: 'username',
        type: String,
        description: 'The name of the user for whom to update the information.',
        required: true,
        example: 'username'
    })
    @ApiBody({
        description: 'Object that contains the Hedera account data.',
        required: true,
        type: CredentialsDTO
    })
    @ApiOkResponse({
        description: 'Successful operation.',
        type: TaskDTO
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @ApiExtraModels(CredentialsDTO, TaskDTO, InternalServerErrorDTO)
    @HttpCode(HttpStatus.ACCEPTED)
    async setUserProfileAsync(
        @AuthUser() user: IAuthUser,
        @Body() profile: any,
        @Req() req
    ): Promise<TaskDTO> {
        const taskManager = new TaskManager();
        const task = taskManager.start(TaskAction.CONNECT_USER, user.id);
        const username: string = user.username;
        const invalidedCacheTags = [`/${PREFIXES.PROFILES}/${username}`, `/${PREFIXES.ACCOUNTS}/session`];
        RunFunctionAsync<ServiceError>(async () => {
            const guardians = new Guardians();
            await guardians.createUserProfileCommonAsync(user, username, profile, task);

            setTimeout(async () => await this.cacheService.invalidate(getCacheKey([req.url, ...invalidedCacheTags], user)), 10000)
        }, async (error) => {
            await this.logger.error(error, ['API_GATEWAY'], user.id);
            taskManager.addError(task.taskId, { code: error.code || 500, message: error.message });

            setTimeout(async () => await this.cacheService.invalidate(getCacheKey([req.url, ...invalidedCacheTags], user)), 10000)
        });
        return task;
    }

    /**
     * Get user balance
     */
    @Get('/:username/balance')
    @Auth(
        Permissions.PROFILES_BALANCE_READ,
        // UserRole.STANDARD_REGISTRY,
        // UserRole.USER,
        // UserRole.AUDITOR
    )
    @ApiOperation({
        summary: 'Returns user\'s Hedera account balance.',
        description: 'Requests Hedera account balance. Only users with the Installer role are allowed to make the request.'
    })
    @ApiParam({
        name: 'username',
        type: String,
        description: 'The name of the user for whom to fetch the balance.',
        required: true,
        example: 'username'
    })
    @ApiOkResponse({
        description: 'Successful operation.',
        type: String
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @ApiExtraModels(InternalServerErrorDTO)
    @UseCache({ ttl: CACHE.SHORT_TTL })
    @HttpCode(HttpStatus.OK)
    async getUserBalance(
        @AuthUser() user: IAuthUser,
        @Param('username') username: string
    ): Promise<string> {
        if (!user.did) {
            return null;
        }
        const guardians = new Guardians();
        const balance = await guardians.getUserBalance(user, username);
        if (isNaN(parseFloat(balance))) {
            throw new HttpException(balance, HttpStatus.UNPROCESSABLE_ENTITY);
        }
        //For backward compatibility
        return JSON.stringify(balance);
    }

    /**
     * Restore user profile
     */
    @Put('/restore/:username')
    @Auth(
        Permissions.PROFILES_RESTORE_ALL,
        // UserRole.STANDARD_REGISTRY
    )
    @ApiOperation({
        summary: 'Restore user data (policy, DID documents, VC documents).',
        description: 'Restore user data (policy, DID documents, VC documents).'
    })
    @ApiParam({
        name: 'username',
        type: String,
        description: 'The name of the user for whom to restore the information.',
        required: true,
        example: 'username'
    })
    @ApiBody({
        description: 'Object that contains the Hedera account data.',
        required: true,
        type: CredentialsDTO
    })
    @ApiOkResponse({
        description: 'Successful operation.',
        type: TaskDTO
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @ApiExtraModels(CredentialsDTO, TaskDTO, InternalServerErrorDTO)
    @HttpCode(HttpStatus.ACCEPTED)
    async restoreUserProfile(
        @AuthUser() user: IAuthUser,
        @Body() profile: any,
        @Req() req
    ): Promise<TaskDTO> {
        const taskManager = new TaskManager();
        const task = taskManager.start(TaskAction.RESTORE_USER_PROFILE, user.id);
        const username: string = user.username;

        const invalidedCacheTags = [`/${PREFIXES.PROFILES}/${username}`];
        RunFunctionAsync<ServiceError>(async () => {
            const guardians = new Guardians();
            await guardians.restoreUserProfileCommonAsync(user, username, profile, task);

            await this.cacheService.invalidate(getCacheKey([req.url, ...invalidedCacheTags], user))
        }, async (error) => {
            await this.logger.error(error, ['API_GATEWAY'], user.id);
            taskManager.addError(task.taskId, { code: error.code || 500, message: error.message });

            await this.cacheService.invalidate(getCacheKey([req.url, ...invalidedCacheTags], user))
        });
        return task;
    }

    /**
     * List of available recovery topics
     */
    @Put('/restore/topics/:username')
    @Auth(
        Permissions.PROFILES_RESTORE_ALL,
        // UserRole.STANDARD_REGISTRY
    )
    @ApiOperation({
        summary: 'List of available recovery topics.',
        description: 'List of available recovery topics.'
    })
    @ApiParam({
        name: 'username',
        type: String,
        description: 'The name of the user for whom to restore the information.',
        required: true,
        example: 'username'
    })
    @ApiBody({
        description: 'Object that contains the Hedera account data.',
        required: true,
        type: CredentialsDTO
    })
    @ApiOkResponse({
        description: 'Successful operation.',
        type: TaskDTO
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @ApiExtraModels(CredentialsDTO, TaskDTO, InternalServerErrorDTO)
    @HttpCode(HttpStatus.ACCEPTED)
    async restoreTopic(
        @AuthUser() user: IAuthUser,
        @Body() profile: any,
        @Req() req
    ): Promise<TaskDTO> {
        const taskManager = new TaskManager();
        const task = taskManager.start(TaskAction.GET_USER_TOPICS, user.id);
        const username: string = user.username;

        const invalidedCacheTags = [`/${PREFIXES.PROFILES}/${username}`];
        RunFunctionAsync<ServiceError>(async () => {
            const guardians = new Guardians();
            await guardians.getAllUserTopicsAsync(user, username, profile, task);

            await this.cacheService.invalidate(getCacheKey([req.url, ...invalidedCacheTags], user))
        }, async (error) => {
            await this.logger.error(error, ['API_GATEWAY'], user.id);
            taskManager.addError(task.taskId, { code: error.code || 500, message: error.message });

            await this.cacheService.invalidate(getCacheKey([req.url, ...invalidedCacheTags], user))
        });
        return task;
    }

    /**
     * Validate DID document format.
     */
    @Post('/did-document/validate')
    @Auth(
        Permissions.PROFILES_USER_UPDATE,
        // UserRole.STANDARD_REGISTRY,
        // UserRole.USER
    )
    @ApiOperation({
        summary: 'Validate DID document format.',
        description: 'Validate DID document format.',
    })
    @ApiBody({
        description: 'DID Document.',
        required: true,
        type: DidDocumentDTO
    })
    @ApiOkResponse({
        description: 'Successful operation.',
        type: DidDocumentStatusDTO,
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @ApiExtraModels(DidDocumentDTO, DidDocumentStatusDTO, InternalServerErrorDTO)
    @HttpCode(HttpStatus.OK)
    async validateDidDocument(
        @AuthUser() user: IAuthUser,
        @Body() document: any
    ): Promise<DidDocumentStatusDTO> {
        if (!document) {
            throw new HttpException('Body is empty', HttpStatus.UNPROCESSABLE_ENTITY)
        }
        try {
            const guardians = new Guardians();
            return await guardians.validateDidDocument(user, document);
        } catch (error) {
            await InternalException(error, this.logger, user.id);
        }
    }

    /**
     * Validate DID document keys.
     */
    @Post('/did-keys/validate')
    @Auth(
        Permissions.PROFILES_USER_UPDATE,
        // UserRole.STANDARD_REGISTRY,
        // UserRole.USER
    )
    @ApiOperation({
        summary: 'Validate DID document keys.',
        description: 'Validate DID document keys.',
    })
    @ApiBody({
        description: 'DID Document and keys.',
        required: true,
        type: DidDocumentWithKeyDTO
    })
    @ApiOkResponse({
        description: 'Successful operation.',
        type: DidKeyStatusDTO,
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error.',
        type: InternalServerErrorDTO
    })
    @ApiExtraModels(DidKeyStatusDTO, DidDocumentWithKeyDTO, InternalServerErrorDTO)
    @HttpCode(HttpStatus.OK)
    async validateDidKeys(
        @AuthUser() user: IAuthUser,
        @Body() body: any
    ): Promise<DidKeyStatusDTO> {
        if (!body) {
            throw new HttpException('Body is empty', HttpStatus.UNPROCESSABLE_ENTITY)
        }
        const { document, keys } = body;
        if (!document) {
            throw new HttpException('Document is empty', HttpStatus.UNPROCESSABLE_ENTITY)
        }
        if (!keys) {
            throw new HttpException('Keys is empty', HttpStatus.UNPROCESSABLE_ENTITY)
        }
        try {
            const guardians = new Guardians();
            return await guardians.validateDidKeys(user, document, keys);
        } catch (error) {
            await InternalException(error, this.logger, user.id);
        }
    }
}
