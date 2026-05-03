`.PHONY: help build up down logs migrate superuser clean
DOCKER_COMPOSE = docker-compose -p fitness-crm

help:
	@echo "Docker commands for Fitness CRM"
	@echo ""
	@echo "  make build      - Build Docker images"
	@echo "  make up         - Start all services"
	@echo "  make down       - Stop all services"
	@echo "  make logs       - Show logs"
	@echo "  make migrate    - Run migrations"
	@echo "  make superuser  - Create superuser"
	@echo "  make clean      - Remove containers and volumes"

build:
	$(DOCKER_COMPOSE) build

up:
	$(DOCKER_COMPOSE) up -d

down:
	$(DOCKER_COMPOSE) down

logs:
	$(DOCKER_COMPOSE) logs -f

migrate:
	$(DOCKER_COMPOSE) exec web python manage.py makemigrations
	$(DOCKER_COMPOSE) exec web python manage.py migrate

superuser:
	$(DOCKER_COMPOSE) exec web python manage.py createsuperuser

clean:
	$(DOCKER_COMPOSE) down -v
	rm -rf frontend-spa/dist
