import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@modules/auth/types/authenticated-user.type';
import { CourseAccessService } from '@modules/courses/services/course-access.service';

type UserLike = AuthenticatedUser | { id: string; role: string };

@Injectable()
export class CourseService {
  constructor(private readonly courseAccess: CourseAccessService) {}

  async isEnrolled(
    user: UserLike | undefined | null,
    courseId: string,
  ): Promise<boolean> {
    if (!user) return false;
    const roleName =
      typeof user.role === 'string' ? user.role.toLowerCase() : '';
    if (
      ['admin', 'super-admin', 'super admin', 'instructor'].includes(roleName)
    ) {
      return true;
    }
    const membership = await this.courseAccess.getMembership(user.id, courseId);
    return membership !== null;
  }
}
