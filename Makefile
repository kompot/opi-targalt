start:
	make start_${LANGUAGE}

start_est:
	env RABBITMQ_USER=guest RABBITMQ_PASS=guest docker-compose -f docker-compose.yaml -f docker-compose-tts-${LANGUAGE}.yaml up
