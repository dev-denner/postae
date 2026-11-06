import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body);
  }

  @Post('register')
  @Public()
  async register(@Body() body: { email: string; password: string; name?: string }) {
    const { user } = await this.authService.register(body);
    return { data: user };
  }

  @Post('refresh')
  @Public()
  async refresh(@Body() body: { refreshToken: string }) {
    const tokens = await this.authService.refresh(body.refreshToken);
    return { data: tokens };
  }

  @Post('logout')
  @Public()
  async logout(@Body() body: { refreshToken: string }) {
    await this.authService.logout(body.refreshToken);
    return { data: { revoked: true } };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    const user = await this.authService.validateUserById(req.user.sub);
    return { data: user };
  }
}
