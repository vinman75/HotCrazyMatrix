from flask import Flask, jsonify
from config import Config
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from werkzeug.exceptions import HTTPException
import os

db = SQLAlchemy()
migrate = Migrate()
login = LoginManager()
csrf = CSRFProtect()

login.login_view = 'auth.login'
login.login_message = 'Please log in to access this page.'

def create_app(config_class=Config):
    # Tell Flask the instance folder is located at the project root
    app = Flask(__name__, instance_relative_config=True) 
    app.config.from_object(config_class)
    
    # Ensure the instance folder exists
    try:
        os.makedirs(app.instance_path)
    except OSError:
        pass

    db.init_app(app)
    migrate.init_app(app, db)
    login.init_app(app)
    csrf.init_app(app)

    # Register blueprints
    from app.auth import bp as auth_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')

    from app.routes import bp as main_bp
    app.register_blueprint(main_bp)

    # Custom JSON error handler
    @app.errorhandler(HTTPException)
    def handle_exception(e):
        response = e.get_response()
        response.data = jsonify({
            "code": e.code,
            "name": e.name,
            "message": e.description,
        }).data
        response.content_type = "application/json"
        return response

    return app

from app import models
