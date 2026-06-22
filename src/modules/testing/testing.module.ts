import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { CoursesModule } from '@modules/courses/courses.module';
import { CourseContentModule } from '@modules/course-content/course-content.module';
import { TestingController } from './controllers/testing.controller';
import { TestingService } from './services/testing.service';

@Module({
  imports: [AuthModule, CoursesModule, CourseContentModule],
  controllers: [TestingController],
  providers: [TestingService],
})
export class TestingModule {}
