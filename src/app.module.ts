import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { configuration } from '@config/configuration';
import { validationSchema } from '@config/validation';
import { DatabaseModule } from '@database/database.module';
import { RedisModule } from '@database/redis.module';
import { AuthModule } from '@modules/auth/auth.module';
import { HealthModule } from '@modules/health/health.module';
import { RbacModule } from '@modules/rbac/rbac.module';
import { UsersModule } from '@modules/users/users.module';
import { CompetitionsModule } from '@modules/competitions/competitions.module';
import { CoursesModule } from '@modules/courses/courses.module';
import { CourseContentModule } from '@modules/course-content/course-content.module';
import { AssessmentsModule } from '@modules/assessments/assessments.module';
import { GamificationModule } from '@modules/gamification/gamification.module';
import { TestingModule } from '@modules/testing/testing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60000, limit: 100 }],
    }),
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.' }),
    DatabaseModule,
    RedisModule,
    RbacModule,
    AuthModule,
    UsersModule,
    GamificationModule,
    CompetitionsModule,
    CoursesModule,
    CourseContentModule,
    AssessmentsModule,
    TestingModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
