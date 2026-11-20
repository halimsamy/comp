import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';

/** ~15 MB of PNG once decoded; a 2x render of a few hundred people fits well within it. */
export const MAX_ORG_CHART_IMAGE_LENGTH = 20_000_000;

export class ExportOrgChartPdfDto {
  @ApiProperty({ description: 'Chart name shown as the document title', example: 'Acme org chart' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'Date the chart reflects (ISO 8601)', example: '2026-11-20' })
  @IsDateString()
  asOf!: string;

  @ApiProperty({ description: 'Number of people on the chart', example: 42 })
  @IsInt()
  @Min(0)
  peopleCount!: number;

  @ApiProperty({ description: 'The rendered chart as a PNG data URL (data:image/png;base64,...)' })
  @IsString()
  @MaxLength(MAX_ORG_CHART_IMAGE_LENGTH)
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, { message: 'image must be a PNG data URL' })
  image!: string;
}
