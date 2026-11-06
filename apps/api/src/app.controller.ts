import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): { data: { message: string; name: string } } {
    return { data: { message: 'Postaê API', name: 'postae' } };
  }
}
