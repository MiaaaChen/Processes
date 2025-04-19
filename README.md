# Processes — A Threads-like Social Platform

**Processes** is a social media platform inspired by Threads.  

Live demo:  
https://processes-g606.onrender.com/  
(Please allow a few seconds for the server to load.)

## Project Overview

This platform allows users to interact in a thread-based social environment. After signing up and logging in, users can post threads, comment, receive notifications, and customize their personal profiles.

## Features

- **Sign up  and login**  
  Users can create a new account or log in to access the full platform.  

  ![register](https://imgur.com/fGtoBg1.png)

  ![login](https://imgur.com/sgeUyJz.png)

- **Posts**  
  Authenticated users can create text posts and optionally upload images.  

  ![post](https://imgur.com/pBuChFh.png)

  ![thread](https://imgur.com/jSqwsGh.png)

- **Comments**  
  Users can view threads and leave comments on individual posts.  

  ![comment](https://imgur.com/EhrOisy.png)

- **Search**  
  Users can find posts by keyword or discover other accounts by name.   

  ![post_search](https://imgur.com/Utn3Zw7.png)

  ![user_search](https://imgur.com/7cttNhw.png)

- **Notification**  
  Users receive notifications for likes, comments, and follow requests.  
  ![notification](https://imgur.com/HL0krjC.png)

- **Profile**  
  Users can update their bio, avatar, and account name from their profile page.

  ![profile](https://imgur.com/ih2vfrs.png)

  ![edit_profile](https://imgur.com/qEdvleM.png)  
  

## Mock Data

To simulate user activity, the homepage displays mock threads and users generated using OpenAI's language model. These are randomly generated and are intended for demonstration purposes.

## Tech Stack

- **Frontend**: React, TypeScript
- **Backend**: Node.js, Express
- **Database**: MongoDB, Redis 
- **Search**: Elasticsearch  
- **File Storage**: AWS S3  
- **Authentication**: JWT  
- **Deployment**: Render

## Access Control

Only authenticated users can access features such as posting, commenting, and profile editing.  
Visitors will be able to view the homepage but must sign in to interact.

## Credits

This project was built as a team collaboration. The version deployed on Render was forked from the team repository and maintained by MiaaaChen.

Original repository:
[https://github.com/Tonyrj3268/Processes.git](https://github.com/Tonyrj3268/Processes.git)