from app import create_app, db
from app.models import User, Girl, Plot

# Create the Flask app instance using the application factory
app = create_app()

# This decorator registers a function to be called when the 'flask shell' command runs.
# It makes it easy to work with your database models in an interactive Python shell
# for testing or debugging, without having to import them manually every time.
@app.shell_context_processor
def make_shell_context():
    return {'db': db, 'User': User, 'Girl': Girl, 'Plot': Plot}

# This conditional is standard in Python scripts.
# While 'flask run' is the recommended way to start the development server,
# this block allows the server to be started by running 'python run.py' directly.
if __name__ == '__main__':
    app.run()