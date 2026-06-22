import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { User } from '@modules/auth/schemas/user.schema';
import { UserProfileResponseDto } from './dto/users.dto';
import { UpdateProfileDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async toProfileResponse(
    user: AuthenticatedUser,
  ): Promise<UserProfileResponseDto> {
    const doc = await this.userModel.findById(user.id).exec();
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
      githubLinked: user.githubLinked,
      reputationScore: user.reputationScore,
      emailVerified: user.emailVerified,
      institution: user.institution,
      preferences: user.preferences,
      currentLevel: doc?.currentLevel,
      selectedTrackId: doc?.selectedTrackId?.toString() ?? null,
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    const update: Partial<User> = {};
    if (dto.name !== undefined) update.displayName = dto.name;
    if (dto.avatar !== undefined) update.avatar = dto.avatar;
    if (dto.preferences !== undefined) update.preferences = dto.preferences;

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: update }, { new: true })
      .populate('role')
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roleName =
      typeof user.role === 'object' && user.role && 'name' in user.role
        ? String((user.role as { name: string }).name)
        : 'student';

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: roleName,
      githubLinked: user.githubLinked,
      reputationScore: user.reputationScore,
      emailVerified: user.emailVerified,
      institution: user.institution,
      preferences: user.preferences ?? {},
      currentLevel: user.currentLevel,
      selectedTrackId: user.selectedTrackId?.toString() ?? null,
    };
  }

  async findById(userId: string): Promise<UserProfileResponseDto> {
    const user = await this.userModel.findById(userId).populate('role').exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roleName =
      typeof user.role === 'object' && user.role && 'name' in user.role
        ? String((user.role as { name: string }).name)
        : 'student';

    return {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: roleName,
      githubLinked: user.githubLinked,
      reputationScore: user.reputationScore,
      emailVerified: user.emailVerified,
      institution: user.institution,
      preferences: user.preferences ?? {},
      currentLevel: user.currentLevel,
      selectedTrackId: user.selectedTrackId?.toString() ?? null,
    };
  }
}
