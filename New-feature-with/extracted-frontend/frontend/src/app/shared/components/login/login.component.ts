import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { getDefaultPortalRoute } from '../../../core/guards/role.guard';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  isLoading = false;
  showPassword = false;

  togglePassword(): void { this.showPassword = !this.showPassword; }

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigate([getDefaultPortalRoute(this.authService.userRole()!)]);
    }
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.toastService.error('Please enter valid email and password.');
      return;
    }

    this.isLoading = true;
    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).subscribe({
      next: (user) => {
        this.isLoading = false;
        this.toastService.success(`Welcome back, ${user.name}!`);
        this.router.navigate([getDefaultPortalRoute(user.role)]);
      },
      error: (err) => {
        this.isLoading = false;
        const msg = err.error?.message || 'Authentication failed. Please try again.';
        this.toastService.error(msg);
      }
    });
  }
}
