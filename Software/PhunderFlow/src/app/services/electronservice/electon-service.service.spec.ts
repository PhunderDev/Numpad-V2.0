import { TestBed } from '@angular/core/testing';

import { ElectonServiceService } from './electon-service.service';

describe('ElectonServiceService', () => {
  let service: ElectonServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ElectonServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
