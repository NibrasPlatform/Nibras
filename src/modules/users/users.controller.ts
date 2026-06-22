import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@common/decorators/auth.decorators';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RolesGuard, SessionAuthGuard } from '@common/guards/auth.guards';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { UpdateProfileDto, UserProfileResponseDto } from './dto/users.dto';
import { RatingsService } from '@modules/competitions/services/ratings.service';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('session')
@ApiCookieAuth('nibras_web_session')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly ratingsService: RatingsService,
  ) {}

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Get authenticated user profile' })
  async getMe(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserProfileResponseDto> {
    return this.usersService.toProfileResponse(user);
  }

  @Patch('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Update authenticated user profile' })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Get(':id/rating-history')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Rating progression for a user' })
  getRatingHistory(
    @Param('id') id: string,
    @Query('platform') platform?: string,
  ) {
    return this.ratingsService.getRatingHistory(id, platform);
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Admin lookup of a user by id' })
  getById(@Param('id') id: string): Promise<UserProfileResponseDto> {
    return this.usersService.findById(id);
  }
}
