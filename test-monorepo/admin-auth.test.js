'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildApp } = require('../apps/api/dist/app');
const { PrismaStore } = require('../apps/api/dist/prisma-store');
const { getSharedPrisma } = require('../apps/api/dist/lib/prisma');
const {
  resolveSelectedLevel,
  toAdminUserPayload,
} = require('../apps/api/dist/features/admin-auth/helpers');

test('resolveSelectedLevel maps yearLevel to study level labels', async () => {
  assert.equal(
    resolveSelectedLevel({
      id: 'demo',
      email: 'demo@nibras.dev',
      username: 'demo',
      displayName: 'Hossam Ahmed',
      systemRole: 'user',
      yearLevel: 2,
    }),
    'Intermediate',
  );
  assert.equal(
    resolveSelectedLevel({
      id: 'beginner',
      email: 'beginner@nibras.dev',
      username: 'beginner',
      displayName: 'Sam Beginner',
      systemRole: 'user',
      yearLevel: 1,
    }),
    'Beginner',
  );
  assert.equal(
    resolveSelectedLevel({
      id: 'advanced',
      email: 'advanced@nibras.dev',
      username: 'advanced',
      displayName: 'Jordan Advanced',
      systemRole: 'user',
      yearLevel: 3,
    }),
    'Advanced',
  );
  assert.equal(
    resolveSelectedLevel({
      id: 'expert',
      email: 'expert@nibras.dev',
      username: 'expert',
      displayName: 'Riley Expert',
      systemRole: 'user',
      yearLevel: 4,
    }),
    'Expert',
  );
  assert.equal(
    (
      await toAdminUserPayload({
        id: 'demo',
        email: 'demo@nibras.dev',
        username: 'demo',
        displayName: 'Hossam Ahmed',
        systemRole: 'user',
        yearLevel: 2,
      })
    ).selectedLevel,
    'Intermediate',
  );
});

const TEST_EMAIL = `admin-auth-test-${Date.now()}@gmail.com`;
const TEST_PASSWORD = 'testpass123';

async function cleanupTestUser(prisma, email) {
  const user = await prisma.user.findUnique({ where: { email } });
  await prisma.authVerification.deleteMany({
    where: {
      OR: [
        { identifier: `otp:signup:${email}` },
        { identifier: `otp:reset:${email}` },
      ],
    },
  });
  if (!user) return;
  await prisma.cliSession.deleteMany({ where: { userId: user.id } });
  await prisma.authAccount.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

test('admin auth register, verify OTP, and login flow', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL not set');
    return;
  }

  const prisma = getSharedPrisma();
  const app = buildApp(new PrismaStore(prisma));
  await cleanupTestUser(prisma, TEST_EMAIL);

  try {
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Auth Test User',
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        role: 'student',
      },
    });
    assert.equal(registerResponse.statusCode, 201);
    assert.match(registerResponse.json().message, /OTP/i);

    const otpRecord = await prisma.authVerification.findFirst({
      where: { identifier: `otp:signup:${TEST_EMAIL}` },
    });
    assert.ok(otpRecord?.value);

    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-otp',
      payload: {
        email: TEST_EMAIL,
        otp: otpRecord.value,
      },
    });
    assert.equal(verifyResponse.statusCode, 200);
    assert.ok(verifyResponse.json().accessToken);
    assert.equal(verifyResponse.json().user.email, TEST_EMAIL);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      },
    });
    assert.equal(loginResponse.statusCode, 200);
    assert.ok(loginResponse.json().token);
  } finally {
    await cleanupTestUser(prisma, TEST_EMAIL);
    await app.close();
  }
});

test('admin auth logout revokes access and refresh tokens', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL not set');
    return;
  }

  const prisma = getSharedPrisma();
  const app = buildApp(new PrismaStore(prisma));
  const email = `logout-${Date.now()}@gmail.com`;
  await cleanupTestUser(prisma, email);

  try {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Logout Test User',
        email,
        password: TEST_PASSWORD,
      },
    });

    const otpRecord = await prisma.authVerification.findFirst({
      where: { identifier: `otp:signup:${email}` },
    });
    assert.ok(otpRecord?.value);

    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-otp',
      payload: { email, otp: otpRecord.value },
    });
    assert.equal(verifyResponse.statusCode, 200);

    const { accessToken, refreshToken } = verifyResponse.json();
    assert.ok(accessToken);
    assert.ok(refreshToken);

    const meBefore = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(meBefore.statusCode, 200);

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { refreshToken },
    });
    assert.equal(logoutResponse.statusCode, 200);

    const meAfter = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(meAfter.statusCode, 401);
  } finally {
    await cleanupTestUser(prisma, email);
    await app.close();
  }
});

test('admin auth accepts non-Gmail email addresses', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL not set');
    return;
  }

  const prisma = getSharedPrisma();
  const app = buildApp(new PrismaStore(prisma));
  const email = `user-${Date.now()}@example.com`;
  await cleanupTestUser(prisma, email);

  try {
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Example User',
        email,
        password: TEST_PASSWORD,
      },
    });
    assert.equal(registerResponse.statusCode, 201);

    const otpRecord = await prisma.authVerification.findFirst({
      where: { identifier: `otp:signup:${email}` },
    });
    assert.ok(otpRecord?.value);

    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-otp',
      payload: { email, otp: otpRecord.value },
    });
    assert.equal(verifyResponse.statusCode, 200);
    assert.equal(verifyResponse.json().user.email, email);
  } finally {
    await cleanupTestUser(prisma, email);
    await app.close();
  }
});

test('admin auth login blocks unverified users with OTP-friendly 403', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL not set');
    return;
  }

  const prisma = getSharedPrisma();
  const app = buildApp(new PrismaStore(prisma));
  const email = `unverified-${Date.now()}@gmail.com`;
  await cleanupTestUser(prisma, email);

  try {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Pending User',
        email,
        password: TEST_PASSWORD,
      },
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: TEST_PASSWORD },
    });
    assert.equal(loginResponse.statusCode, 403);
    assert.match(
      String(loginResponse.json().message).toLowerCase(),
      /not verified|otp/,
    );
  } finally {
    await cleanupTestUser(prisma, email);
    await app.close();
  }
});

test('admin auth forgot and reset password flow', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL not set');
    return;
  }

  const prisma = getSharedPrisma();
  const app = buildApp(new PrismaStore(prisma));
  const email = `reset-${Date.now()}@gmail.com`;
  const newPassword = 'newpass456';
  await cleanupTestUser(prisma, email);

  try {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Reset Test',
        email,
        password: TEST_PASSWORD,
      },
    });

    const otpRecord = await prisma.authVerification.findFirst({
      where: { identifier: `otp:signup:${email}` },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/verify-otp',
      payload: { email, otp: otpRecord.value },
    });

    const forgotResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email },
    });
    assert.equal(forgotResponse.statusCode, 200);

    const resetOtpRecord = await prisma.authVerification.findFirst({
      where: { identifier: `otp:reset:${email}` },
    });
    assert.ok(resetOtpRecord?.value);

    const resetResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: {
        email,
        otp: resetOtpRecord.value,
        newPassword,
      },
    });
    assert.equal(resetResponse.statusCode, 200);

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: TEST_PASSWORD },
    });
    assert.equal(oldLogin.statusCode, 401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: newPassword },
    });
    assert.equal(newLogin.statusCode, 200);
  } finally {
    await cleanupTestUser(prisma, email);
    await app.close();
  }
});

test('admin auth change-password updates credential password', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL not set');
    return;
  }

  const prisma = getSharedPrisma();
  const app = buildApp(new PrismaStore(prisma));
  const email = `change-pass-${Date.now()}@gmail.com`;
  const newPassword = 'newpass456';
  await cleanupTestUser(prisma, email);

  try {
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Change Pass Test',
        email,
        password: TEST_PASSWORD,
      },
    });

    const otpRecord = await prisma.authVerification.findFirst({
      where: { identifier: `otp:signup:${email}` },
    });
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-otp',
      payload: { email, otp: otpRecord.value },
    });
    const token = verifyResponse.json().accessToken;
    assert.ok(token);

    const wrongCurrent = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        currentPassword: 'wrong-password',
        newPassword,
      },
    });
    assert.equal(wrongCurrent.statusCode, 401);

    const changeResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        currentPassword: TEST_PASSWORD,
        newPassword,
      },
    });
    assert.equal(changeResponse.statusCode, 200);
    assert.match(changeResponse.json().message, /updated/i);

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: TEST_PASSWORD },
    });
    assert.equal(oldLogin.statusCode, 401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: newPassword },
    });
    assert.equal(newLogin.statusCode, 200);
  } finally {
    await cleanupTestUser(prisma, email);
    await app.close();
  }
});

test('admin auth google login uses Google profile fetch', async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL not set');
    return;
  }

  const prisma = getSharedPrisma();
  const app = buildApp(new PrismaStore(prisma));
  const email = `google-${Date.now()}@gmail.com`;
  const originalFetch = global.fetch;

  global.fetch = async (url, init) => {
    if (String(url).includes('googleapis.com/oauth2/v3/userinfo')) {
      return new Response(
        JSON.stringify({
          sub: `google-sub-${Date.now()}`,
          email,
          name: 'Google Test User',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return originalFetch(url, init);
  };

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { access_token: 'mock-google-token' },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().user.email, email);
    assert.ok(response.json().accessToken);
  } finally {
    global.fetch = originalFetch;
    await cleanupTestUser(prisma, email);
    await app.close();
  }
});
