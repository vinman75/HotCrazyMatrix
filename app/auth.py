from flask import Blueprint, render_template, redirect, url_for, flash
from flask_login import login_user, logout_user, current_user, login_required
from app import db
from app.models import User
from app.forms import LoginForm, RegistrationForm, DeleteAccountForm, SettingsForm

bp = Blueprint('auth', __name__)

@bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        if user is None or not user.check_password(form.password.data):
            flash('Invalid username or password')
            return redirect(url_for('auth.login'))
        login_user(user, remember=form.remember_me.data)
        return redirect(url_for('main.dashboard'))
    return render_template('login.html', title='Sign In', form=form)

@bp.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('auth.login'))

@bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
    form = RegistrationForm()
    if form.validate_on_submit():
        user = User(username=form.username.data)
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()
        flash('Congratulations, you are now a registered user!')
        return redirect(url_for('auth.login'))
    return render_template('register.html', title='Register', form=form)

@bp.route('/settings', methods=['POST'])
@login_required
def settings():
    form = SettingsForm()
    if form.validate_on_submit():
        current_user.timezone = form.timezone.data
        db.session.commit()
        flash('Your settings have been updated.')
    else:
        flash('There was an error updating your settings.', 'danger')
    return redirect(url_for('main.dashboard'))


@bp.route('/delete_account', methods=['GET', 'POST'])
@login_required
def delete_account():
    form = DeleteAccountForm()
    if form.validate_on_submit():
        if not current_user.check_password(form.password.data):
            flash('Incorrect password. Account not deleted.')
            return redirect(url_for('auth.delete_account'))
        
        user_to_delete = User.query.get(current_user.id)
        logout_user()
        
        if user_to_delete:
            db.session.delete(user_to_delete)
            db.session.commit()
            flash('Your account has been permanently deleted.')
        else:
            flash('An error occurred. Could not find user to delete.')

        return redirect(url_for('auth.login'))
        
    return render_template('delete_account.html', title='Delete Account', form=form)